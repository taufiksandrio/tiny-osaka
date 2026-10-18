// Startup gate for staging/production: fails closed (exit 1) before `next start` if the server environment is
// incomplete or unsafe. Prints variable NAMES only, never values. Run with --conditions=react-server.
import { lstat, realpath } from "node:fs/promises";
import { isRemoteTarget } from "../src/server/db/config.mjs";
import { getPublicDatabaseConfig, getPublicSource } from "../src/server/public/config.mjs";
import { getAuthConfig } from "../src/server/auth/config.mjs";
import { getCmsDatabaseConfig } from "../src/server/cms/request-policy.mjs";
import { storageRoot } from "../src/server/media/storage.mjs";

const target = process.env.PUBLIC_DATABASE_TARGET;
if (!isRemoteTarget(target)) {
  console.error("PUBLIC_DATABASE_TARGET must be staging or production for this start command.");
  process.exit(1);
}

const failed = [];
const check = async (name, fn) => { try { await fn(); } catch { failed.push(name); } };
await check("PUBLIC_CONTENT_SOURCE", () => { if (getPublicSource() !== "published") throw new Error(); });
await check("DATABASE_URL", () => getPublicDatabaseConfig());
await check("CMS_DATABASE_URL", () => getCmsDatabaseConfig());
await check("BETTER_AUTH_SECRET/BETTER_AUTH_URL", () => getAuthConfig());
await check("MEDIA_STORAGE_ROOT", async () => {
  const root = storageRoot();
  // The volume mount must already exist; never silently create the directory on the ephemeral disk.
  if (!(await lstat(root)).isDirectory() || await realpath(root) !== root) throw new Error();
});
// Operator-only credentials must never be present on the web service.
for (const name of ["MIGRATION_DATABASE_URL", "RAILWAY_ADMIN_DATABASE_URL", "TINY_OSAKA_BOOTSTRAP_OWNER_PASSWORD"]) {
  if (process.env[name]) failed.push(`${name} (must not be set on web)`);
}
if (failed.length) {
  console.error(`Refusing to start: invalid or missing server configuration: ${failed.join(", ")}`);
  process.exit(1);
}
console.log(`Server configuration OK for target ${target}.`);
