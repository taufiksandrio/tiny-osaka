import test from "node:test";
import assert from "node:assert/strict";
import { parseCsv, csvRecords, parsePrice, findClaims, planImport, toProductInput, categorySummary, normalizeName, CLAIM_KEYWORDS, fillableDescription, checkPhotoUrl, checkRedirect, photoAlt, photoMap, downloadPhoto } from "../../scripts/lib/catalog-csv.mjs";
import { parseProductInput } from "../../src/server/catalog/product-input.mjs";

test("parseCsv handles quotes, commas, escaped quotes, newlines in fields, CRLF and BOM", () => {
  const rows = parseCsv('﻿a,b,c\r\n"x, y","say ""hi""","l1\nl2"\r\n,,\r\n');
  assert.deepEqual(rows, [["a", "b", "c"], ["x, y", 'say "hi"', "l1\nl2"], ["", "", ""]]);
  assert.throws(() => parseCsv('a,"b'), /kutip/);
});
test("csvRecords maps columns, requires headers and rejects ragged rows", () => {
  assert.deepEqual(csvRecords("n,p\nA,1\n", ["n"]), [{ n: "A", p: "1" }]);
  assert.throws(() => csvRecords("n,p\nA,1\n", ["zzz"]), /zzz/);
  assert.throws(() => csvRecords("n,p\nA,1,2\n"), /kolom/);
});
test("parsePrice accepts whole IDR with thousand separators only", () => {
  assert.equal(parsePrice("85,000"), 85000);
  assert.equal(parsePrice("107,500"), 107500);
  assert.equal(parsePrice("107.500"), 107500);
  assert.equal(parsePrice(" 32500 "), 32500);
  for (const bad of ["", "abc", "Rp 85.000", "85,5", "85,00", "-5", "0", "1,2,3", "8.5.000x"]) assert.equal(parsePrice(bad), null, bad);
});
test("findClaims flags health, ingredient and quality claims whole-word and case-insensitively", () => {
  const cases = {
    "Kaya Vitamin C, Dan Mengandung Probiotik": ["vitamin", "probiotik"],
    "Kaya antioksidan dan rendah lemak": ["antioksidan", "rendah lemak"],
    "Sumber protein dan kalsium": ["protein", "kalsium"],
    "Energi alami dari buah": ["energi"],
    "garam himalaya": ["himalaya"],
    "resep OTENTIK dari Jepang": ["otentik"],
    "resep autentik": ["autentik"],
    "gurita asli": ["asli"],
  };
  for (const [text, expected] of Object.entries(cases)) assert.deepEqual(findClaims(text), expected, text);
  for (const promo of ["premium", "terbaik", "pilihan", "kualitas", "impor", "kaya", "sumber", "mengandung"]) assert.equal(CLAIM_KEYWORDS.includes(promo), false, promo);
  assert.deepEqual(findClaims("daging sapi impor premium pilihan, keju terbaik, kualitas"), []);
});
test("findClaims leaves neutral composition text alone and does not match inside words", () => {
  assert.deepEqual(findClaims("Takoyaki Tiny Osaka tanpa topping apapun"), []);
  assert.deepEqual(findClaims("Kakao dan pisang yang creamy mengenyangkan. Milk, Choco powder, banana, yogurt."), []);
  assert.deepEqual(findClaims("Brioche bun, 100 grams smashed beef patty, red cheddar slice"), []);
  assert.deepEqual(findClaims("proteinase kayaknya asliran"), []);
  assert.deepEqual(findClaims(undefined), []);
});
const rec = (nama_menu, harga, deskripsi = "", extra = {}) => ({ nama_menu, kategori: "K", harga, deskripsi, deeplink_grab: "", deeplink_gofood: "", ...extra });
test("planImport creates, clears claimed descriptions, keeps links and flags rejects/skips", () => {
  const plans = planImport([
    rec("A", "10,000", "Takoyaki tanpa topping", { deeplink_gofood: " https://gofood.link/a/X " }),
    rec("B", "20.000", "Kaya Vitamin C", { deeplink_grab: "https://app.grab.com/s/Y" }),
    rec("", "5,000"), rec("C", "gratis"), rec("a", "10,000"), rec("Sudah Ada", "1,000"),
  ], new Set([normalizeName("sudah  ada")]));
  assert.deepEqual(plans.map(plan => plan.status), ["create", "create", "reject", "reject", "skip", "skip"]);
  assert.equal(plans[0].description, "Takoyaki tanpa topping");
  assert.deepEqual(plans[0].links, { gofoodUrl: "https://gofood.link/a/X" });
  assert.equal(plans[1].description, "");
  assert.equal(plans[1].descriptionCleared, true);
  assert.deepEqual(plans[1].links, { grabfoodUrl: "https://app.grab.com/s/Y" });
  assert.equal(plans[4].reason, "nama ganda di CSV");
  assert.equal(plans[5].reason, "nama sudah ada");
  assert.equal(plans[0].line, 2);
});
test("toProductInput produces input the CMS validator accepts; empty links are not sent", () => {
  const [plan] = planImport([rec("Takoyaki (6 Pcs)", "46,000", "Tanpa topping", { deeplink_grab: "https://app.grab.com/s/Z" })]);
  const input = toProductInput(plan);
  assert.deepEqual(Object.keys(input).sort(), ["description", "grabfoodUrl", "name", "price"]);
  assert.equal(parseProductInput(input).price, 46000);
  const [bare] = planImport([rec("Plain", "1,000")]);
  assert.equal("gofoodUrl" in toProductInput(bare), false);
  assert.equal(parseProductInput(toProductInput(bare)).description, "");
});
const GOOD = "https://huawei-food-cms.grab.com/item/X1/photos/a.jpg";
const reply = (status, { headers = {}, body = null } = {}) => new Response(body, { status, headers });
test("checkPhotoUrl accepts only https on the exact Grab CDN host without port or userinfo", () => {
  assert.equal(checkPhotoUrl(GOOD).ok, true);
  for (const bad of ["", "http://huawei-food-cms.grab.com/a.jpg", "https://evil.example/a.jpg", "https://grab.com/a.jpg",
    "https://huawei-food-cms.grab.com.evil.example/a.jpg", "https://evil.huawei-food-cms.grab.com/a.jpg", "https://huawei-food-cms.grab.com:8443/a.jpg",
    "https://user:pw@huawei-food-cms.grab.com/a.jpg", "https://huawei-food-cms.grab.com@evil.example/a.jpg", "https:///huawei-food-cms.grab.com/a.jpg",
    "ftp://huawei-food-cms.grab.com/a.jpg", "javascript:alert(1)", "https://huawei-food-cms.grab.com/a b.jpg", "https://app.grab.com/s/p4X1CTK3"]) {
    assert.equal(checkPhotoUrl(bad).ok, false, bad);
  }
});
test("checkRedirect revalidates every hop", () => {
  assert.equal(checkRedirect(GOOD, "/other/b.jpg").ok, true);
  assert.equal(checkRedirect(GOOD, "https://evil.example/b.jpg").ok, false);
  assert.equal(checkRedirect(GOOD, "http://huawei-food-cms.grab.com/b.jpg").ok, false);
  assert.equal(checkRedirect(GOOD, "").ok, false);
});
test("photoAlt is 'Foto <name>', one line, <= 500, no markup", () => {
  assert.equal(photoAlt("  Takoyaki   Botak (6 Pcs) "), "Foto Takoyaki Botak (6 Pcs)");
  assert.equal(photoAlt(""), null);
  assert.equal(photoAlt("<b>x</b>"), null);
  assert.equal(photoAlt("x".repeat(600)), null);
  assert.equal(photoAlt("a\nb"), "Foto a b");
  assert.equal(photoAlt("a\u0000b"), null);
});
test("photoMap maps normalized names to URLs, ignoring blanks", () => {
  const map = photoMap([{ nama_menu: "A  B", url_foto_grabfood: GOOD }, { nama_menu: "C", url_foto_grabfood: " " }]);
  assert.equal(map.get(normalizeName("a b")), GOOD);
  assert.equal(map.has("c"), false);
});
test("downloadPhoto returns bytes, follows a same-host redirect and sends redirect:manual", async () => {
  const seen = [];
  const fetchImpl = async (url, options) => {
    seen.push([url, options.redirect]);
    return seen.length === 1 ? reply(302, { headers: { location: "/final.jpg" } }) : reply(200, { body: new Uint8Array([1, 2, 3]) });
  };
  assert.deepEqual([...await downloadPhoto(GOOD, { fetchImpl })], [1, 2, 3]);
  assert.deepEqual(seen.map(item => item[1]), ["manual", "manual"]);
  assert.equal(seen[1][0], "https://huawei-food-cms.grab.com/final.jpg");
});
test("downloadPhoto rejects bad hosts without calling fetch, foreign redirects, errors, empty and oversize bodies", async () => {
  let calls = 0;
  const count = fetchImpl => async (...args) => { calls++; return fetchImpl(...args); };
  await assert.rejects(downloadPhoto("https://evil.example/a.jpg", { fetchImpl: count(() => reply(200)) }), /host/);
  await assert.rejects(downloadPhoto("http://huawei-food-cms.grab.com/a.jpg", { fetchImpl: count(() => reply(200)) }), /https/);
  assert.equal(calls, 0);
  await assert.rejects(downloadPhoto(GOOD, { fetchImpl: async () => reply(302, { headers: { location: "https://evil.example/x.jpg" } }) }), /redirect ditolak/);
  await assert.rejects(downloadPhoto(GOOD, { fetchImpl: async () => reply(302, { headers: { location: GOOD } }) }), /terlalu banyak redirect/);
  await assert.rejects(downloadPhoto(GOOD, { fetchImpl: async () => reply(404) }), /HTTP 404/);
  await assert.rejects(downloadPhoto(GOOD, { fetchImpl: async () => reply(200, { body: new Uint8Array(0) }) }), /kosong/);
  await assert.rejects(downloadPhoto(GOOD, { maxBytes: 4, fetchImpl: async () => reply(200, { body: new Uint8Array(10) }) }), /ukuran/);
  await assert.rejects(downloadPhoto(GOOD, { maxBytes: 4, fetchImpl: async () => reply(200, { headers: { "content-length": "999" }, body: new Uint8Array(2) }) }), /ukuran/);
});
test("fillableDescription fills only empty stored descriptions with claim-free CSV text for existing cards", () => {
  const existing = new Set([normalizeName("A"), normalizeName("B"), normalizeName("C"), normalizeName("D")]);
  const plans = planImport([rec("A", "1,000", "Tanpa topping"), rec("B", "1,000", "Resep otentik"), rec("C", "1,000", ""), rec("D", "1,000", "Isi lain"),
    rec("E", "1,000", "Baru")], existing);
  const [a, b, c, d, e] = plans;
  assert.equal(fillableDescription({ description: "" }, a), "Tanpa topping");
  assert.equal(fillableDescription({ description: "  " }, a), "Tanpa topping");
  assert.equal(fillableDescription({ description: "Sudah ada" }, a), null);
  assert.equal(fillableDescription({ description: "" }, b), null);
  assert.equal(fillableDescription({ description: "" }, c), null);
  assert.equal(fillableDescription({ description: "" }, d), "Isi lain");
  assert.equal(fillableDescription(undefined, a), null);
  assert.equal(fillableDescription({ description: "" }, e), null);
  const dup = planImport([rec("X", "1,000", "t"), rec("x", "1,000", "t")])[1];
  assert.equal(fillableDescription({ description: "" }, dup), null);
});
test("categorySummary counts categories", () => {
  assert.deepEqual(categorySummary([{ kategori: "X" }, { kategori: "X" }, { kategori: "" }]), [{ category: "X", count: 2 }, { category: "(kosong)", count: 1 }]);
});
