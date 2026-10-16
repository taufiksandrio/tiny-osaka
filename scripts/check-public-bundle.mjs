import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const secrets = [];
for (const [key, value] of Object.entries(process.env)) {
  if (!/DATABASE_URL$/.test(key) || !value) continue;
  secrets.push(value);
  const password = decodeURIComponent(new URL(value).password);
  if (password.length >= 8) secrets.push(password);
}
assert.ok(secrets.length > 0, "Load local environment for the bundle check.");
let checked = 0;
const scan = async directory => {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await scan(file);
    else {
      const data = await readFile(file, "utf8");
      assert.ok(secrets.every(secret => !data.includes(secret)), "Private database value found in a public build asset.");
      checked++;
    }
  }
};
await scan(".next/static");
console.log(`Public bundle check passed: ${checked} assets, no loaded database URLs/passwords.`);
