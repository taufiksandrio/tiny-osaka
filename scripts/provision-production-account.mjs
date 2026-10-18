// One-time bootstrap of the FIRST Owner on staging/production. Refuses if any Owner already exists; never overwrites.
// Credentials come from stdin JSON {"email","password","name"} or the env pair below, and are never logged.
//   MIGRATION_DATABASE_URL=... node --conditions=react-server scripts/provision-production-account.mjs --target staging < owner.json
//   (or TINY_OSAKA_BOOTSTRAP_OWNER_EMAIL / TINY_OSAKA_BOOTSTRAP_OWNER_PASSWORD [/ _NAME] in the operator shell)
import { connectRemoteOwner, resolveTarget } from "./lib/railway-db.mjs";
import { provisionAccount } from "../src/server/auth/provision.mjs";

const MIN_PASSWORD = 12;
const readInput = async () => {
  const { TINY_OSAKA_BOOTSTRAP_OWNER_EMAIL: email, TINY_OSAKA_BOOTSTRAP_OWNER_PASSWORD: password, TINY_OSAKA_BOOTSTRAP_OWNER_NAME: name } = process.env;
  delete process.env.TINY_OSAKA_BOOTSTRAP_OWNER_PASSWORD;
  if (email && password) return { email, password, ...(name ? { name } : {}) };
  if (process.stdin.isTTY) throw new Error();
  let input = "";
  for await (const chunk of process.stdin) {
    input += chunk;
    if (input.length > 4096) throw new Error();
  }
  return JSON.parse(input.replace(/^﻿/, ""));
};

let owner;
try {
  const target = resolveTarget(process.argv.slice(2));
  const fields = await readInput();
  if (typeof fields.password !== "string" || fields.password.length < MIN_PASSWORD) throw new Error();
  owner = await connectRemoteOwner(target);
  const { rows: [existing] } = await owner.query("SELECT count(*)::int AS owners FROM cms_auth.roles WHERE role = 'owner'");
  if (existing.owners !== 0) throw new Error();
  await provisionAccount({ client: owner, email: fields.email, password: fields.password, name: fields.name, role: "owner" });
  fields.password = "";
  console.log("First Owner created. Sign in at /admin/login, change the password and enable MFA. Email ownership is not verified.");
} catch {
  console.error(`Owner bootstrap failed; no credentials logged. Check input (password >= ${MIN_PASSWORD} chars), the target, or whether an Owner already exists; nothing was overwritten.`);
  process.exitCode = 1;
} finally { if (owner) await owner.end(); }
