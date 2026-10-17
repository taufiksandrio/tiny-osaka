import { access } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import sharp from "sharp";
import { videoReady } from "../src/server/media/storage.mjs";
const configured = videoReady();
let video = false;
if (configured) {
  try {
    for (const executable of [process.env.FFMPEG_PATH, process.env.FFPROBE_PATH]) {
      await access(executable);
      await promisify(execFile)(executable, ["-version"], { timeout: 5000, maxBuffer: 100000, windowsHide: true });
    }
    video = true;
  } catch { /* Only capabilities are reported, never operator paths or environment. */ }
}
console.log(JSON.stringify({ imageInspector: sharp.versions.sharp, videoConfigured: configured, videoExecutablesAvailable: video }));
