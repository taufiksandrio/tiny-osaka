// Regenerates drizzle-remote/ (staging/production SQL) from drizzle/. Touches only local files; no database.
// Run: node scripts/build-remote-migrations.mjs   (add --check to verify without writing)
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { transformedFiles, remoteFolder, sourceFolder, remoteJournal } from "./lib/remote-migration-sql.mjs";

const check = process.argv.includes("--check");
const files = transformedFiles();
let different = 0;
if (!check) mkdirSync(`${remoteFolder}/meta`, { recursive: true });
for (const { name, sql } of files) {
  if (check) {
    let current = null;
    try { current = readFileSync(`${remoteFolder}/${name}`, "utf8"); } catch { /* reported below */ }
    if (current !== sql) { different += 1; console.error(`Differs: ${name}`); }
  } else writeFileSync(`${remoteFolder}/${name}`, sql);
}
if (check) {
  const readJournal = folder => { try { return JSON.stringify(remoteJournal(readFileSync(`${folder}/meta/_journal.json`, "utf8"))); } catch { return null; } };
  const journalSame = readJournal(sourceFolder) === readJournal(remoteFolder);
  if (!journalSame) { different += 1; console.error("Differs: meta/_journal.json"); }
  if (different) process.exitCode = 1;
  else console.log("drizzle-remote matches the generated output.");
} else {
  writeFileSync(`${remoteFolder}/meta/_journal.json`, JSON.stringify(remoteJournal(readFileSync(`${sourceFolder}/meta/_journal.json`, "utf8")), null, 2) + "\n");
  console.log(`Wrote ${files.length} migration files to drizzle-remote/.`);
}
