import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { inspectImage, createLocalStorage, storageRoot, videoReady, videoAvailable } from "../../src/server/media/storage.mjs";
import { fileResponse } from "../../src/server/media/http.mjs";
const image = () => sharp({ create: { width: 12, height: 8, channels: 3, background: "red" } }).png().toBuffer();
const stream = bytes => new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.close(); } });
test("full image decoding rejects corrupt, unsupported and oversize inputs", async () => {
  assert.equal((await inspectImage(await image())).mime, "image/png");
  for (const bytes of [Buffer.from("not an image"), Buffer.alloc(10000001), Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="12" height="8"></svg>'), (await image()).subarray(0, 40)]) {
    await assert.rejects(inspectImage(bytes), { code: "INVALID_MEDIA" });
  }
  const large = await sharp({ create: { width: 4097, height: 1, channels: 3, background: "red" } }).png().toBuffer();
  await assert.rejects(inspectImage(large), { code: "INVALID_MEDIA" });
});
test("local immutable copy preserves bytes and rejects mismatched MIME and traversal", async () => {
  const storage = createLocalStorage({ PUBLIC_DATABASE_TARGET: "test" }); const bytes = await image();
  const received = await storage.receive(stream(bytes), "image/png");
  try {
    assert.deepEqual(await storage.read(received.report), bytes);
    const response = fileResponse({ asset: received.report, ...await storage.delivery(received.report) }, new Request("http://localhost/media/id"));
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
    await assert.rejects(storage.read({ ...received.report, storageKey: "../../secret.png" }));
    await assert.rejects(storage.read({ ...received.report, checksum: "0".repeat(64) }));
  } finally { await received.discard(); }
  await assert.rejects(storage.receive(stream(bytes), "image/jpeg"), { code: "INVALID_MEDIA" });
  await assert.rejects(storage.receive(stream(Buffer.alloc(10000001)), "image/png"), { code: "INPUT_TOO_LARGE" });
  assert.equal(videoReady({}), false);
  assert.equal(await videoAvailable({}), false);
  await assert.rejects(storage.receive(stream(bytes), "video/mp4"), { code: "VIDEO_UNAVAILABLE" });
  assert.throws(() => storageRoot({ PUBLIC_DATABASE_TARGET: "production" }), { code: "STORAGE_UNAVAILABLE" });
});
test("byte serving supports bounded single ranges and disables shared caching", async () => {
  const result = { asset: { mime: "video/mp4" }, bytes: Buffer.from("0123456789") };
  for (const [range, expected] of [["bytes=2-4", "234"], ["bytes=-3", "789"], ["bytes=7-", "789"]]) {
    const response = fileResponse(result, new Request("http://localhost/media/id", { headers: { range } }));
    assert.equal(response.status, 206); assert.equal(await response.text(), expected);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
  }
  for (const range of ["bytes=20-30", "bytes=0-1,4-5", "bytes=-0", "bytes=a-b"]) assert.equal(fileResponse(result, new Request("http://localhost/media/id", { headers: { range } })).status, 416);
});
