import assert from "node:assert/strict";
import test from "node:test";
import { pageDefinitions, getPageDefinition, isInternalPageLink } from "../../src/server/pages/templates.mjs";
import { PageContentError, validatePageFields, validatePageReadiness } from "../../src/server/pages/validation.mjs";
import { hashPageContent } from "../../src/server/pages/content-hash.mjs";
import { createPageWorkflow } from "../../src/server/pages/workflow.mjs";
import { getPublishedPage } from "../../src/server/pages/published.mjs";
import { fields, pageGraph, rich } from "../fixtures/page-content.mjs";

const code = expected => error => error instanceof PageContentError && error.code === expected;
const badContent = run => assert.throws(run, code("INVALID_CONTENT"));
const db = new Proxy({}, { get: () => { throw new Error("private-connection-secret"); } });
const token = { revisionId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", expectedVersion: 1, expectedHash: "a".repeat(64) };
const owner = () => createPageWorkflow({ db, resolveActor: async () => ({ subject: "trusted-owner-subject", role: "owner" }) });

test("nine fixed page identities map to existing routes and immutable template definitions", () => {
  assert.deepEqual(Object.keys(pageDefinitions).sort(), ["home", "about", "menu", "guides", "promos", "location",
    "guide-takoyaki", "guide-okonomiyaki", "guide-burger"].sort());
  for (const page of Object.values(pageDefinitions)) {
    assert.ok(Object.isFrozen(page));
    assert.ok(isInternalPageLink("/id" + page.path)); assert.ok(isInternalPageLink("/en" + page.path));
  }
  for (const key of ["unknown", "__proto__", "constructor", 1, null]) assert.equal(getPageDefinition(key), null);
});

test("partial drafts are allowed; submission requires Indonesian title and body while legacy rows remain valid", () => {
  assert.equal(validatePageFields("about", "id", {}), true);
  badContent(() => validatePageFields("about", "id", {}, { ready: true }));
  for (const key of Object.keys(pageDefinitions)) {
    assert.equal(validatePageReadiness(pageGraph(key)), true);
    const missing = pageGraph(key); missing.translations = missing.translations.filter(row => row.locale !== "id");
    assert.throws(() => validatePageReadiness(missing), code("NOT_READY"));
  }
});

test("unknown locale, template fields, layout and prototype keys are rejected", () => {
  for (const locale of ["jp", "ID", null]) assert.throws(() => validatePageFields("about", locale, {}), code("INVALID_INPUT"));
  for (const extra of ["style", "className", "html", "template", "pageKey", "__proto__", "constructor", "href"]) {
    const value = JSON.parse(JSON.stringify(fields()));
    Object.defineProperty(value, extra, { value: "forged", enumerable: true });
    badContent(() => validatePageFields("about", "id", value));
  }
  for (const value of [null, [], "html", new Date()]) badContent(() => validatePageFields("about", "id", value));
});

test("text requires bounded strings; blank required fields and NUL fail", () => {
  for (const value of ["", " \n\t", 1, null, "private\0content", "x".repeat(241)]) {
    const f = fields(); f.title = value;
    badContent(() => validatePageFields("about", "id", f, { ready: true }));
  }
  const large = fields(); large.summary = "x".repeat(2001);
  badContent(() => validatePageFields("about", "id", large));
});

test("structured text supports headings/lists/marks/internal links and preserves literal text", () => {
  const f = fields();
  f.body = { blocks: [
    { type: "heading", level: 2, content: [{ text: "QA", marks: ["bold", "italic"] }] },
    { type: "paragraph", content: [{ text: "<script>alert(1)</script>", href: "/id/menu" }] },
    { type: "list", ordered: false, items: [[{ text: "QA list" }]] },
  ] };
  const before = structuredClone(f);
  assert.equal(validatePageFields("about", "id", f, { ready: true }), true);
  assert.deepEqual(f, before);
});

test("rich document rejects arbitrary HTML/media nodes, nested structures and unsafe attributes", () => {
  for (const block of [
    { type: "html", html: "<img onerror=x>" }, { type: "iframe", src: "https://example.com" },
    { type: "heading", level: 1, content: [{ text: "QA" }] },
    { type: "paragraph", content: [{ text: "QA", style: "color:red" }] },
    { type: "paragraph", content: [{ text: "QA", marks: ["bold", "bold"] }] },
    { type: "paragraph", content: [{ text: "QA", marks: ["script"] }] },
    { type: "paragraph", content: [{ text: "QA", marks: new Array(1) }] },
    { type: "paragraph", content: [{ type: "paragraph", content: [] }] },
    { type: "list", ordered: "yes", items: [] },
    { type: "paragraph", content: [{ text: "QA" }], onClick: "x" },
  ]) { const f = fields(); f.body = { blocks: [block] }; badContent(() => validatePageFields("about", "id", f)); }
});

test("link allowlist refuses external/protocol-relative/encoded/query and unsupported paths", () => {
  for (const href of ["javascript:alert(1)", "data:text/html,x", "https://example.com", "//example.com",
    "/id/menu?x=1", "/id/%6denu", "/id/../en/menu", "/id/menu#x", "/jp/menu", "/id/menu/sample-01",
    " /id/menu", "/id/menu/", "/id\\menu"]) {
    assert.equal(isInternalPageLink(href), false);
    const f = fields(); f.body.blocks[0].content[0].href = href;
    badContent(() => validatePageFields("about", "id", f));
  }
});

test("rich documents enforce block/span/size limits and nonempty review content", () => {
  for (const document of [
    { blocks: Array.from({ length: 101 }, () => rich().blocks[0]) },
    { blocks: [{ type: "paragraph", content: Array.from({ length: 101 }, () => ({ text: "QA" })) }] },
    { blocks: [{ type: "paragraph", content: [{ text: "x".repeat(4001) }] }] },
  ]) { const f = fields(); f.body = document; badContent(() => validatePageFields("about", "id", f)); }
  const empty = fields(); empty.body = { blocks: [] };
  assert.equal(validatePageFields("about", "id", empty), true);
  badContent(() => validatePageFields("about", "id", empty, { ready: true }));
  const large = fields(); large.body = { blocks: Array.from({ length: 20 }, () => rich("x".repeat(4000)).blocks[0]) };
  badContent(() => validatePageFields("about", "id", large));
});

test("readiness refuses duplicate locales, foreign scopes, wrong template and invalid roots", () => {
  for (const mutate of [
    g => { g.translations[1].locale = "id"; }, g => { g.translations[0].revisionId = token.revisionId; },
    g => { g.page.template = "home"; }, g => { g.revision.pageKey = "home"; },
    g => { g.revision.version = 0; }, g => { delete g.translations[0].fields.title; },
  ]) { const g = pageGraph(); mutate(g); assert.throws(() => validatePageReadiness(g), code("NOT_READY")); }
});

test("hash tolerates JSON object/locale order and excludes workflow metadata", () => {
  const a = pageGraph(), b = structuredClone(a);
  b.translations.reverse();
  for (const row of b.translations) row.fields = Object.fromEntries(Object.entries(row.fields).reverse());
  b.revision.status = "published"; b.revision.createdAt = new Date(); b.revision.contentHash = "ignored";
  assert.equal(hashPageContent(a), hashPageContent(b));
});

test("hash binds all fields, ordered rich content, identities, scope and version", () => {
  const a = pageGraph(), expected = hashPageContent(a);
  for (const name of Object.keys(a.translations[0].fields)) {
    const b = structuredClone(a);
    b.translations[0].fields[name] = typeof b.translations[0].fields[name] === "string" ? "changed" : rich("changed");
    assert.notEqual(hashPageContent(b), expected);
  }
  for (const mutate of [
    g => { g.revision.id = "changed"; }, g => { g.revision.pageKey = "home"; }, g => { g.revision.version++; },
    g => { g.page.template = "home"; }, g => { g.page.key = "home"; },
    g => { g.translations[0].revisionId = "changed"; }, g => { g.translations[0].locale = "jp"; },
  ]) { const b = structuredClone(a); mutate(b); assert.notEqual(hashPageContent(b), expected); }
  a.translations[0].fields.body.blocks.push(rich("second").blocks[0]);
  const b = structuredClone(a); b.translations[0].fields.body.blocks.reverse();
  assert.notEqual(hashPageContent(a), hashPageContent(b));
});

test("missing identity denies every page write even with forged Owner input", async () => {
  for (const identity of [null, {}, { subject: "a", role: "admin" }, { subject: "", role: "owner" }]) {
    const workflow = createPageWorkflow({ db, resolveActor: async () => identity });
    for (const action of Object.keys(workflow)) await assert.rejects(workflow[action]({ ...token, role: "owner", actorId: "forged" }), code("AUTH_REQUIRED"));
  }
  await assert.rejects(createPageWorkflow({ db }).createDraft({ pageKey: "home" }), code("AUTH_REQUIRED"));
});

test("Staff cannot approve/reject/publish/archive and resolver failures are sanitized", async () => {
  const workflow = createPageWorkflow({ db, resolveActor: async () => ({ subject: "trusted-staff", role: "staff" }) });
  for (const action of ["approve", "reject", "publish", "archive"]) await assert.rejects(workflow[action]({ ...token, role: "owner" }), code("FORBIDDEN"));
  const broken = createPageWorkflow({ db, resolveActor: async () => { throw new Error("private-auth-secret"); } });
  await assert.rejects(broken.submit(token), code("AUTH_REQUIRED"));
});

test("invalid revision/version/hash, source and template inputs fail before persistence", async () => {
  for (const input of [null, {}, { ...token, revisionId: "x" }, { ...token, expectedVersion: 0 },
    { ...token, expectedVersion: 2147483648 }]) await assert.rejects(owner().submit(input), code("INVALID_INPUT"));
  for (const hash of [null, [], {}, "X".repeat(64)]) await assert.rejects(owner().approve({ ...token, expectedHash: hash }), code("INVALID_INPUT"));
  await assert.rejects(owner().createDraft({ pageKey: "unknown" }), code("INVALID_INPUT"));
  await assert.rejects(owner().cloneDraft({ sourceRevisionId: "x", expectedSourceVersion: 1 }), code("INVALID_INPUT"));
  await assert.rejects(owner().saveTranslation({ ...token, expectedVersion: 2147483647 }), code("INVALID_INPUT"));
});

test("database failures expose no raw secrets and published reader validates page/locale", async () => {
  await assert.rejects(owner().createDraft({ pageKey: "about" }), code("PERSISTENCE_FAILED"));
  await assert.rejects(owner().submit(token), code("PERSISTENCE_FAILED"));
  await assert.rejects(getPublishedPage(db, { pageKey: "about", locale: "id" }), code("PERSISTENCE_FAILED"));
  for (const input of [null, { pageKey: "unknown", locale: "en" }, { pageKey: "about", locale: "jp" }]) {
    await assert.rejects(getPublishedPage(db, input), code("INVALID_INPUT"));
  }
});

