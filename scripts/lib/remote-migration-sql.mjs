import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Option P: staging/production migrations are copies of drizzle/*.sql whose owner-dispatch blocks gain two
// extra branches (staging, production). The dev/test files stay untouched so their hashes remain valid.
// The copies live in drizzle-remote/ and are regenerated/verified from drizzle/ by this transform.
export const sourceFolder = fileURLToPath(new URL("../../drizzle", import.meta.url));
export const remoteFolder = fileURLToPath(new URL("../../drizzle-remote", import.meta.url));
export const EXPECTED_DISPATCH_BRANCHES = 9;
// Staging/production stay on the reviewed 0000-0017 plan. Later migrations (0018 MCP OAuth) are excluded
// until a separate production approval extends this limit together with production-migration-plan.mjs.
export const REMOTE_MIGRATION_LIMIT = 18;
export const remoteJournal = text => { const journal = JSON.parse(text); return { ...journal, entries: journal.entries.slice(0, REMOTE_MIGRATION_LIMIT) }; };

const branch = /^[ \t]*ELSIF current_user='tiny_osaka_dev_owner' THEN \w+\s*:=\s*'tiny_osaka_dev_(?:app|cms)';/;

// Adds the staging and production branch after every reviewed dev branch. Returns { sql, added }.
export const transformMigration = sql => {
  let added = 0;
  const out = sql.split("\n").flatMap(line => {
    if (!branch.test(line)) return [line];
    added += 1;
    const cr = line.endsWith("\r") ? "\r" : "";
    const base = cr ? line.slice(0, -1) : line;
    return [line, base.replaceAll("dev", "staging") + cr, base.replaceAll("dev", "production") + cr];
  });
  return { sql: out.join("\n"), added };
};

export const transformedFiles = (folder = sourceFolder) => {
  let total = 0;
  const files = readdirSync(folder).filter(name => /^\d{4}_.+\.sql$/.test(name)).sort().slice(0, REMOTE_MIGRATION_LIMIT).map(name => {
    const { sql, added } = transformMigration(readFileSync(`${folder}/${name}`, "utf8"));
    total += added;
    return { name, sql };
  });
  if (total !== EXPECTED_DISPATCH_BRANCHES) throw new Error("Unexpected number of owner dispatch branches in reviewed migrations.");
  return files;
};
