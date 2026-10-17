import test from "node:test";
import assert from "node:assert/strict";
import { homeDraft, fillHomeDraft } from "../../src/features/public-site/home-draft.mjs";
import { validatePageFields } from "../../src/server/pages/validation.mjs";
test("home editorial draft completes both fixed templates with reviewed business facts", () => {
  for (const locale of ["id", "en"]) {
    validatePageFields("home", locale, homeDraft[locale], { ready: true });
    assert.match(homeDraft[locale].summary, /Bandung/);
    assert.match(homeDraft[locale].summary, /delivery/);
  }
});
test("loading the home draft fills blank fields without overwriting either language", () => {
  const existing = { id: { title: "Owner title", summary: "   ", body: { blocks: [] } }, en: { seoTitle: "Owner SEO" } };
  const filled = fillHomeDraft(existing);
  assert.equal(filled.id.title, "Owner title"); assert.equal(filled.en.seoTitle, "Owner SEO");
  assert.equal(filled.id.summary, homeDraft.id.summary);
  assert.deepEqual(filled.id.body, homeDraft.id.body);
  assert.deepEqual(existing.id.body, { blocks: [] });
  filled.id.body.blocks[0].content[0].text = "Edited";
  assert.notEqual(homeDraft.id.body.blocks[0].content[0].text, "Edited");
});
