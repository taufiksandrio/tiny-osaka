import "server-only";
import { randomUUID, createHash } from "node:crypto";
import { mkdir, open, readFile, realpath, lstat, link, unlink, access } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { createReadStream, constants } from "node:fs";
import { Readable } from "node:stream";
import sharp from "sharp";
import { mediaFail, validStorageKey } from "./validation.mjs";
import { mediaPolicy as limits } from "./policy.mjs";

const execute = promisify(execFile);
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const fileDigest = async file => {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
};
export const storageRoot = (env = process.env) => {
  const target = env.PUBLIC_DATABASE_TARGET || "dev";
  if (["staging", "production"].includes(target)) {
    // Remote targets store media on a persistent volume whose mount path comes from the server env.
    const configured = env.MEDIA_STORAGE_ROOT;
    if (typeof configured !== "string" || !path.isAbsolute(configured) || configured.includes("\0") ||
      configured.split(/[\\/]+/).includes("..") || path.parse(configured).root === path.resolve(configured)) {
      mediaFail("STORAGE_UNAVAILABLE", "Media storage volume path is not configured.");
    }
    return path.resolve(configured);
  }
  if (!["test", "dev"].includes(target)) mediaFail("STORAGE_UNAVAILABLE", "Local storage target required.");
  return path.resolve(".media", target);
};
export const videoReady = (env = process.env) => [env.FFMPEG_PATH, env.FFPROBE_PATH].every(value => typeof value === "string" && path.isAbsolute(value));
export const videoAvailable = async (env = process.env) => {
  if (!videoReady(env)) return false;
  try {
    for (const executable of [env.FFMPEG_PATH, env.FFPROBE_PATH]) {
      if (!(await lstat(executable)).isFile()) return false;
      await access(executable, constants.X_OK);
    }
    return true;
  } catch { return false; }
};
export const inspectImage = async bytes => {
  if (!bytes.length || bytes.length > limits.imageBytes) mediaFail("INVALID_MEDIA", "Image exceeds size policy.");
  let info;
  try {
    info = await sharp(bytes, { failOn: "warning", limitInputPixels: limits.imageSide ** 2 }).metadata();
    if (!["jpeg", "png", "webp"].includes(info.format) || info.pages > 1 || !info.width || !info.height ||
      info.width > limits.imageSide || info.height > limits.imageSide) throw new Error();
    await sharp(bytes, { failOn: "warning", limitInputPixels: limits.imageSide ** 2 }).raw().toBuffer();
  } catch { mediaFail("INVALID_MEDIA", "Unsupported or corrupt image."); }
  const rotated = [5, 6, 7, 8].includes(info.orientation);
  return { mime: "image/" + info.format, width: rotated ? info.height : info.width, height: rotated ? info.width : info.height, durationMs: null,
    byteSize: bytes.length, checksum: digest(bytes), extension: info.format === "jpeg" ? "jpg" : info.format };
};
const inspectVideo = async (file, env) => {
  if (!await videoAvailable(env)) mediaFail("VIDEO_UNAVAILABLE", "Configure local FFmpeg and ffprobe first.");
  try {
    const handle = await open(file, "r"), signature = Buffer.alloc(256);
    try { await handle.read(signature, 0, signature.length, 0); } finally { await handle.close(); }
    const isMp4 = signature.subarray(4, 8).toString("ascii") === "ftyp" &&
      /isom|iso[2-9]|mp4[12]|avc1|M4V /.test(signature.subarray(8).toString("ascii"));
    const isWebm = signature.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) && signature.includes(Buffer.from("webm"));
    if (!isMp4 && !isWebm) throw new Error();
    const { stdout } = await execute(env.FFPROBE_PATH, ["-v", "error", "-protocol_whitelist", "file,pipe", "-show_streams", "-show_format", "-of", "json", file],
      { timeout: 15000, maxBuffer: 1000000, windowsHide: true });
    const report = JSON.parse(stdout), streams = report.streams || [];
    const video = streams.filter(stream => stream.codec_type === "video");
    const format = report.format?.format_name || "";
    const webm = isWebm && format.includes("webm"), mp4 = isMp4 && format.split(",").includes("mp4");
    const durationMs = Math.ceil(Number(report.format?.duration) * 1000);
    if (video.length !== 1 || (!webm && !mp4) || !Number.isSafeInteger(durationMs) || durationMs < 1 || durationMs > limits.videoDurationMs ||
      !Number.isSafeInteger(video[0].width) || !Number.isSafeInteger(video[0].height) || Math.min(video[0].width, video[0].height) < 1 ||
      Math.max(video[0].width, video[0].height) > limits.videoLongSide || Math.min(video[0].width, video[0].height) > limits.videoShortSide ||
      (webm ? !["vp8", "vp9", "av1"].includes(video[0].codec_name) : video[0].codec_name !== "h264") ||
      streams.some(stream => !["video", "audio"].includes(stream.codec_type)) ||
      streams.some(stream => stream.codec_type === "audio" && !(webm ? ["opus", "vorbis"] : ["aac"]).includes(stream.codec_name))) throw new Error();
    await execute(env.FFMPEG_PATH, ["-nostdin", "-v", "error", "-xerror", "-protocol_whitelist", "file,pipe", "-i", file, "-f", "null", "-"],
      { timeout: 30000, maxBuffer: 1000000, windowsHide: true });
    return { mime: webm ? "video/webm" : "video/mp4", extension: webm ? "webm" : "mp4", width: video[0].width, height: video[0].height, durationMs };
  } catch { mediaFail("INVALID_MEDIA", "Invalid video or local inspection unavailable."); }
};
export const createLocalStorage = (env = process.env) => {
  const root = storageRoot(env);
  const initialize = async () => {
    await mkdir(root, { recursive: true, mode: 0o700 });
    if (await realpath(root) !== root || !(await lstat(root)).isDirectory()) throw new Error("Unsafe media directory.");
  };
  const checkedFile = async asset => {
    if (!validStorageKey(asset.storageKey)) throw new Error("Invalid storage key.");
    const file = path.join(root, asset.storageKey);
    const stat = await lstat(file);
    if (!stat.isFile() || stat.size !== Number(asset.byteSize) || stat.size > limits.videoBytes || await realpath(file) !== file) throw new Error("Unsafe media object.");
    return file;
  };
  const read = async asset => {
    const file = await checkedFile(asset);
    const bytes = await readFile(file);
    if (bytes.length !== Number(asset.byteSize) || digest(bytes) !== asset.checksum) throw new Error("Media integrity failure.");
    return bytes;
  };
  const delivery = async asset => {
    const file = await checkedFile(asset);
    if (await fileDigest(file) !== asset.checksum) throw new Error("Media integrity failure.");
    return { openRange: (start, end) => Readable.toWeb(createReadStream(file, { start, end })) };
  };
  const receive = async (body, type) => {
    const image = ["image/jpeg", "image/png", "image/webp"].includes(type);
    if (!image && !["video/mp4", "video/webm"].includes(type)) mediaFail("INVALID_MEDIA", "Unsupported media type.");
    if (!image && !await videoAvailable(env)) mediaFail("VIDEO_UNAVAILABLE", "Configure local video inspection first.");
    await initialize();
    const temporary = path.join(root, randomUUID() + ".pending");
    const handle = await open(temporary, "wx", 0o600);
    let bytes = 0, closed = false;
    try {
      const reader = body?.getReader();
      if (!reader) mediaFail("INVALID_MEDIA", "Empty upload.");
      const deadline = Date.now() + 60000;
      try {
        while (true) {
          let timer;
          const wait = Math.min(10000, deadline - Date.now());
          if (wait <= 0) mediaFail("UPLOAD_TIMEOUT", "Upload timed out.");
          let chunk;
          try {
            chunk = await Promise.race([reader.read(), new Promise((_, reject) => {
              timer = setTimeout(() => reject(new Error("Upload timeout.")), wait);
            })]);
          } finally { clearTimeout(timer); }
          if (chunk.done) break;
          bytes += chunk.value.byteLength;
          if (bytes > (image ? limits.imageBytes : limits.videoBytes)) {
            await reader.cancel(); mediaFail("INPUT_TOO_LARGE", "Upload exceeds size policy.");
          }
          await handle.writeFile(chunk.value);
        }
      } catch (error) { await reader.cancel().catch(() => {}); throw error; }
      finally { reader.releaseLock(); }
      await handle.close(); closed = true;
      if (!bytes) mediaFail("INVALID_MEDIA", "Empty upload.");
      const report = image ? await inspectImage(await readFile(temporary)) : await inspectVideo(temporary, env);
      if (report.mime !== type) mediaFail("INVALID_MEDIA", "Declared MIME does not match decoded file.");
      const storageKey = randomUUID() + "." + report.extension;
      const asset = { ...report, storageKey, byteSize: bytes, checksum: await fileDigest(temporary), verified: true };
      // Hard link fails if the destination exists: no overwrite, even during a race.
      await link(temporary, path.join(root, storageKey));
      return { report: asset, discard: () => unlink(path.join(root, storageKey)) };
    } finally {
      if (!closed) await handle.close();
      await unlink(temporary).catch(() => {});
    }
  };
  return { receive, read, delivery };
};
