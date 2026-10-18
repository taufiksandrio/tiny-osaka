import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { connectTestOwner } from "./lib/test-db.mjs";
import { verifyCmsProtection } from "./lib/cms-protection.mjs";
import { verifyCatalogProtection } from "./lib/catalog-protection.mjs";

// Local, read-only checks. Never prints secret values: only the variable NAME of a leak is reported.
const SECRET_NAME = /SECRET|PASSWORD|TOKEN|API_KEY|DATABASE_URL|MIGRATION/i;
const walk = async dir => (await Promise.all((await readdir(dir, { withFileTypes: true })).map(entry =>
  entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]))).flat();

const scanClientBundle = async () => {
  let files;
  try { files = await walk(".next/static"); } catch { throw new Error("Missing .next/static: run `npm run build` before security:check."); }
  assert.ok(files.length > 0, "`.next/static` is empty: run `npm run build` first.");
  const secrets = Object.entries(process.env).filter(([name, value]) => SECRET_NAME.test(name) && value && value.length >= 12);
  const leaks = new Set();
  for (const file of files.filter(name => /\.(js|css|map|json|html|txt)$/.test(name))) {
    const text = await readFile(file, "utf8");
    for (const [name, value] of secrets) if (text.includes(value) || text.includes(name)) leaks.add(name);
  }
  assert.deepEqual([...leaks], [], "Server-only variable name or value found in client bundle: " + [...leaks].join(", "));
  return { files: files.length, secrets: secrets.length };
};

const owner = await connectTestOwner();
try {
  await verifyCmsProtection(owner, "tiny_osaka_test_owner");
  await verifyCatalogProtection(owner, "tiny_osaka_test_owner", 17);
  console.log("OK: CMS role privileges and catalog protection verified on the test database.");
} finally { await owner.end(); }
const scanned = await scanClientBundle();
console.log(`OK: no server-only variable name or value in .next/static (${scanned.files} files, ${scanned.secrets} variables checked).`);
