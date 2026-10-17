import pg from "pg";
import { randomBytes } from "node:crypto";
import { statSync, writeFileSync } from "node:fs";
const file = new URL("../.env.cms.local", import.meta.url);
const client = new pg.Client({ host: "127.0.0.1", port: 5432, database: "postgres", user: "postgres",
  password: process.env.TINY_OSAKA_SETUP_ADMIN_PASSWORD, connectionTimeoutMillis: 5000 });
delete process.env.TINY_OSAKA_SETUP_ADMIN_PASSWORD;
let committed = false;
try {
  if (statSync(file).size !== 0) throw new Error();
  await client.connect();
  await client.query("BEGIN");
  const { rows } = await client.query("SELECT d.datname,r.rolname, NOT r.rolcanlogin AND NOT r.rolsuper AS safe FROM pg_database d JOIN pg_roles r ON r.oid=d.datdba WHERE d.datname IN ('tiny_osaka_dev','tiny_osaka_test')");
  if (rows.length !== 2 || rows.some(row => row.rolname !== row.datname + "_owner" || !row.safe)) throw new Error();
  const existing = await client.query("SELECT rolname FROM pg_roles WHERE rolname IN ('tiny_osaka_dev_cms','tiny_osaka_test_cms')");
  if (existing.rowCount) throw new Error();
  const lines = [];
  for (const target of ["dev", "test"]) {
    const role = `tiny_osaka_${target}_cms`, database = `tiny_osaka_${target}`;
    const password = randomBytes(48).toString("hex");
    // Only fixed identifiers and generated hex enter DDL; no caller text.
    await client.query(`CREATE ROLE ${role} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT CONNECTION LIMIT 5 PASSWORD '${password}'`);
    await client.query(`GRANT CONNECT ON DATABASE ${database} TO ${role}`);
    lines.push(`${target === "test" ? "TEST_" : ""}CMS_DATABASE_URL=postgresql://${role}:${password}@127.0.0.1:5432/${database}`);
  }
  // Write before commit: if filesystem fails, role changes roll back.
  writeFileSync(file, lines.join("\n") + "\n");
  await client.query("COMMIT"); committed = true;
  console.log("Local dev/test CMS roles and private config created. No content migration applied.");
} catch {
  if (!committed) await client.query("ROLLBACK").catch(() => {});
  console.error("CMS setup failed; no credentials logged. Inspect private config/role state before retry.");
  process.exitCode = 1;
} finally { await client.end(); }
