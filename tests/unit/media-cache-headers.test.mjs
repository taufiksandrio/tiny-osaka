import test from "node:test";
import assert from "node:assert/strict";
import { PUBLIC_MEDIA_MAX_AGE, mediaEtag, etagMatches, adminMediaHeaders, publicMediaHeaders, publicNotFound, publicNotModified } from "../../src/server/media/cache-headers.mjs";

const asset = { mime: "image/webp", checksum: "ab".repeat(32) };
const request = headers => new Request("http://localhost/media/x", { headers });

test("public headers: bounded public cache, strong checksum ETag, no Vary, nosniff and sandbox CSP", () => {
  assert.equal(PUBLIC_MEDIA_MAX_AGE, 3600);
  const headers = publicMediaHeaders(asset);
  assert.equal(headers["Cache-Control"], "public, max-age=3600");
  assert.equal(headers.ETag, `"${asset.checksum}"`); assert.equal(mediaEtag(asset), headers.ETag);
  assert.ok(!("Vary" in headers)); assert.ok(!/immutable/.test(headers["Cache-Control"]));
  assert.equal(headers["X-Content-Type-Options"], "nosniff");
  assert.equal(headers["Content-Security-Policy"], "default-src 'none'; sandbox");
  assert.equal(headers["Content-Type"], "image/webp");
});
test("admin headers stay private, uncached and cookie-varying", () => {
  const headers = adminMediaHeaders(asset);
  assert.equal(headers["Cache-Control"], "private, no-store"); assert.equal(headers.Vary, "Cookie");
  assert.ok(!("ETag" in headers));
  assert.equal(headers["X-Content-Type-Options"], "nosniff");
});
test("If-None-Match matching: exact, list, weak prefix and wildcard match; others do not", () => {
  const etag = mediaEtag(asset);
  for (const header of [etag, `"x", ${etag}`, `W/${etag}`, "*", ` ${etag} `]) assert.equal(etagMatches(header, etag), true, header);
  for (const header of [null, "", `"other"`, etag.slice(1, -1), `"x", "y"`]) assert.equal(etagMatches(header, etag), false, String(header));
});
test("a matching conditional request is 304 without body; a mismatch or no header falls through to the file", async () => {
  const response = publicNotModified(asset, request({ "if-none-match": mediaEtag(asset) }));
  assert.equal(response.status, 304); assert.equal(await response.text(), "");
  assert.equal(response.headers.get("etag"), mediaEtag(asset)); assert.equal(response.headers.get("cache-control"), "public, max-age=3600");
  assert.equal(response.headers.has("vary"), false);
  assert.equal(publicNotModified(asset, request({ "if-none-match": '"stale"' })), null);
  assert.equal(publicNotModified(asset, request({})), null);
});
test("unknown or withdrawn assets are 404 with no-store", async () => {
  const response = publicNotFound();
  assert.equal(response.status, 404); assert.equal(response.headers.get("cache-control"), "no-store"); assert.equal(await response.text(), "");
});
test("fileResponse serves public assets cacheably (200 and 206) and admin assets privately", async () => {
  const { fileResponse } = await import("../../src/server/media/http.mjs");
  const bytes = Buffer.from("0123456789");
  const file = { asset: { ...asset, byteSize: 10 }, bytes };
  const open = await fileResponse(file, request({}), { visibility: "public" });
  assert.equal(open.status, 200); assert.equal(open.headers.get("cache-control"), "public, max-age=3600");
  assert.equal(open.headers.get("etag"), mediaEtag(asset)); assert.equal(open.headers.has("vary"), false);
  const part = await fileResponse(file, request({ range: "bytes=2-4" }), { visibility: "public" });
  assert.equal(part.status, 206); assert.equal(await part.text(), "234"); assert.equal(part.headers.get("content-range"), "bytes 2-4/10");
  const admin = fileResponse(file, request({}));
  assert.equal(admin.headers.get("cache-control"), "private, no-store"); assert.equal(admin.headers.get("vary"), "Cookie"); assert.equal(admin.headers.has("etag"), false);
});
