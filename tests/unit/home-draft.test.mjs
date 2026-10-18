import test from "node:test";
import assert from "node:assert/strict";
import { homeDraft, fillHomeDraft } from "../../src/features/public-site/home-draft.mjs";
import { validatePageFields } from "../../src/server/pages/validation.mjs";
test("home editorial draft completes the Indonesian template with reviewed business facts", () => {
  validatePageFields("home", homeDraft, { ready: true });
  assert.match(homeDraft.summary, /Bandung/);
  assert.match(homeDraft.summary, /delivery/);
});
test("loading the Indonesian home draft fills blanks without overwriting authored content", () => {
  const existing = { title: "Owner title", summary: "   ", body: { blocks: [] } };
  const filled = fillHomeDraft(existing);
  assert.equal(filled.title, "Owner title");
  assert.equal(filled.summary, homeDraft.summary);
  assert.deepEqual(filled.body, homeDraft.body);
  assert.deepEqual(existing.body, { blocks: [] });
  filled.body.blocks[0].content[0].text = "Edited";
  assert.notEqual(homeDraft.body.blocks[0].content[0].text, "Edited");
});
