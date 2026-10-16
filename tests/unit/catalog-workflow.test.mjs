import assert from "node:assert/strict";
import test from "node:test";
import { createCatalogWorkflow } from "../../src/server/catalog/workflow.mjs";
import { CatalogDraftError } from "../../src/server/catalog/drafts.mjs";

const code = expected => error => error instanceof CatalogDraftError && error.code === expected;
const db = new Proxy({}, { get: () => { throw new Error("private-database-secret"); } });
const input = { revisionId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", expectedVersion: 1, expectedHash: "a".repeat(64) };

test("unwired auth and request-supplied identities fail closed before DB access", async () => {
  for (const identity of [undefined, null, {}, { subject: "staff", role: "admin" },
    { subject: "", role: "owner" }, { subject: "a\0b", role: "owner" }]) {
    const workflow = createCatalogWorkflow({ db, resolveActor: identity === undefined ? undefined : async () => identity });
    for (const action of ["submit", "approve", "reject", "publish", "archive"]) {
      await assert.rejects(workflow[action]({ ...input, role: "owner", actor: { subject: "forged", role: "owner" } }), code("AUTH_REQUIRED"));
    }
  }
});

test("staff cannot approve, reject, publish or archive even with forged input roles", async () => {
  const workflow = createCatalogWorkflow({ db, resolveActor: async () => ({ subject: "trusted-staff-id", role: "staff" }) });
  for (const action of ["approve", "reject", "publish", "archive"]) {
    await assert.rejects(workflow[action]({ ...input, role: "owner" }), code("FORBIDDEN"));
  }
});

test("resolver errors are sanitized without logging secrets", async () => {
  const workflow = createCatalogWorkflow({ db, resolveActor: async () => { throw new Error("private-auth-secret"); } });
  await assert.rejects(workflow.submit(input), code("AUTH_REQUIRED"));
});

test("authenticated inputs require valid exact revision and hash before DB access", async () => {
  const workflow = createCatalogWorkflow({ db, resolveActor: async () => ({ subject: "trusted-owner-id", role: "owner" }) });
  for (const bad of [null, {}, { ...input, revisionId: "invalid" }, { ...input, expectedVersion: 0 },
    { ...input, expectedVersion: 1.5 }, { ...input, expectedVersion: 2147483648 }]) {
    await assert.rejects(workflow.submit(bad), code("INVALID_INPUT"));
  }
  for (const expectedHash of ["", null, "x".repeat(64), "a".repeat(63), ["a".repeat(64)], {}]) {
    await assert.rejects(workflow.approve({ ...input, expectedHash }), code("INVALID_INPUT"));
  }
});

test("driver failures return sanitized persistence errors", async () => {
  const workflow = createCatalogWorkflow({ db, resolveActor: async () => ({ subject: "trusted-owner-id", role: "owner" }) });
  await assert.rejects(workflow.submit(input), code("PERSISTENCE_FAILED"));
});

