import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { buildThumbnail, createThumbnails, LIST_THUMBNAIL_LIMIT, THUMB_MAX_SIDE, THUMB_TARGET_BYTES } from "../../src/server/mcp/thumbnails.mjs";
import { parseToolInput, withImages, imagesOf, tools } from "../../src/server/mcp/tools.mjs";

// v2 Q-7 (AC-42..45), unit level.
const noise = (width, height) => {
  const raw = Buffer.alloc(width * height * 3);
  for (let i = 0; i < raw.length; i++) raw[i] = (i * 2654435761 >>> 24) & 255;
  return sharp(raw, { raw: { width, height, channels: 3 } }).png().toBuffer();
};
const silent = async run => {
  const original = console.error, lines = [];
  console.error = (...args) => lines.push(args.join(" "));
  try { return { value: await run(), lines }; } finally { console.error = original; }
};
const rows = count => Array.from({ length: count }, (_, i) => ({ id: "id-" + i, kind: i % 5 === 4 ? "youtube" : "image" }));

test("AC-43: a large image becomes a WebP with longest side <= 512 and a small payload", async () => {
  const thumb = await buildThumbnail(await noise(1600, 1000));
  const bytes = Buffer.from(thumb.data, "base64"), info = await sharp(bytes).metadata();
  assert.equal(thumb.mimeType, "image/webp"); assert.equal(info.format, "webp");
  assert.ok(Math.max(info.width, info.height) <= THUMB_MAX_SIDE, "longest side");
  assert.ok(bytes.length < THUMB_TARGET_BYTES, "size " + bytes.length);
  assert.deepEqual(Object.keys(thumb).sort(), ["data", "mimeType"]);
});

test("AC-43: a small image is not enlarged", async () => {
  const info = await sharp(Buffer.from((await buildThumbnail(await noise(100, 60))).data, "base64")).metadata();
  assert.deepEqual([info.width, info.height], [100, 60]);
});

test("AC-43: video and YouTube assets get no thumbnail and no bytes are read", async () => {
  let reads = 0;
  const thumbs = createThumbnails({ readBytes: async () => { reads++; return Buffer.alloc(0); }, build: async () => ({ mimeType: "image/webp", data: "x" }) });
  for (const kind of ["video", "youtube"]) assert.equal(await thumbs.forAsset({}, new Headers(), { id: "a", kind }), null);
  assert.equal(reads, 0);
});

test("AC-44: a failing read or a corrupt image yields null, logs no detail and never throws", async () => {
  const secret = "/var/media/SECRET-KEY.png";
  const failing = createThumbnails({ readBytes: async () => { throw new Error(secret); } });
  const corrupt = createThumbnails({ readBytes: async () => Buffer.from("not an image") });
  const { value, lines } = await silent(async () => [await failing.forAsset({}, new Headers(), { id: "a", kind: "image" }), await corrupt.forAsset({}, new Headers(), { id: "b", kind: "image" })]);
  assert.deepEqual(value, [null, null]);
  assert.equal(lines.length, 2); assert.ok(lines.every(line => !line.includes("SECRET") && !line.includes("/var/") && !line.includes("not an image")), "no detail");
});

test("AC-44: at most the configured number of thumbnails are built at once", async () => {
  let active = 0, peak = 0;
  const thumbs = createThumbnails({ concurrency: 2, readBytes: async () => Buffer.alloc(1),
    build: async () => { active++; peak = Math.max(peak, active); await new Promise(resolve => setTimeout(resolve, 15)); active--; return { mimeType: "image/webp", data: "x" }; } });
  const made = await thumbs.forList({}, new Headers(), rows(10).map(row => ({ ...row, kind: "image" })), 10);
  assert.equal(made.length, 10); assert.equal(peak, 2);
});

test("AC-45: forList thumbnails only the first N image rows, in list order, skipping non-images", async () => {
  const seen = [];
  const thumbs = createThumbnails({ readBytes: async (_cms, _h, asset) => { seen.push(asset.id); return Buffer.alloc(1); }, build: async () => ({ mimeType: "image/webp", data: "x" }) });
  const made = await thumbs.forList({}, new Headers(), rows(48));
  assert.equal(LIST_THUMBNAIL_LIMIT, 12); assert.ok(LIST_THUMBNAIL_LIMIT >= 10 && LIST_THUMBNAIL_LIMIT <= 20);
  assert.equal(made.length, 12); assert.equal(seen.length, 12);
  assert.deepEqual(made.map(item => item.id), seen, "list order");
  assert.equal(made.at(-1).id, "id-13", "first 12 images are ids 0-3, 5-8, 10-13");
  assert.ok(!made.some(item => ["id-4", "id-9"].includes(item.id)), "youtube rows skipped");
});

test("AC-45: a failure on one row drops only that thumbnail", async () => {
  const thumbs = createThumbnails({ readBytes: async (_c, _h, asset) => { if (asset.id === "id-1") throw new Error("x"); return Buffer.alloc(1); }, build: async () => ({ mimeType: "image/webp", data: "x" }) });
  const { value } = await silent(() => thumbs.forList({}, new Headers(), rows(3)));
  assert.deepEqual(value.map(item => item.id), ["id-0", "id-2"]);
});

test("AC-42/45: media_list accepts an optional boolean thumbnails; images ride outside the JSON text", () => {
  assert.deepEqual(parseToolInput("media_list", { thumbnails: true }), { thumbnails: true });
  for (const bad of [{ thumbnails: "yes" }, { thumbnails: 1 }, { limit: 20 }]) assert.throws(() => parseToolInput("media_list", bad));
  const output = withImages({ rows: [{ id: "a" }] }, [{ mimeType: "image/webp", data: "AAAA", extra: "ignored" }]);
  assert.deepEqual(imagesOf(output), [{ mimeType: "image/webp", data: "AAAA" }]);
  assert.equal(JSON.stringify(output), '{"rows":[{"id":"a"}]}');
  assert.deepEqual(imagesOf({ rows: [] }), []); assert.deepEqual(imagesOf(withImages({ a: 1 }, [])), []);
  assert.match(tools.media_list.description, /thumbnails/); assert.match(tools.media_list.description, /12/); assert.match(tools.media_get.description, /createdAt/);
});
