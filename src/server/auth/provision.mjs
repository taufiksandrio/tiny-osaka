import "server-only";
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";

// Trusted local operator only; never import into a route handler.
export const provisionAccount = async ({ client, email, password, role, name = "CMS account" }) => {
  if (typeof email !== "string" || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    typeof password !== "string" || password.length < 20 || password.length > 128 ||
    !["owner", "staff"].includes(role) || typeof name !== "string" || !name.trim() || name.length > 100) {
    throw new Error("Invalid internal account input; use a valid email and a unique 20-128 character password.");
  }
  const { rows: [identity] } = await client.query("SELECT current_database() AS database,current_user AS role");
  if (!["test", "dev"].some(target => identity.database === `tiny_osaka_${target}` && identity.role === `tiny_osaka_${target}_owner`)) {
    throw new Error("Account provisioning requires a verified local owner connection.");
  }
  const normalizedEmail = email.trim().toLowerCase();
  const digest = await hashPassword(password);
  const id = randomUUID();
  await client.query("BEGIN");
  try {
    await client.query("SELECT pg_advisory_xact_lock(76210987)");
    await client.query("INSERT INTO cms_auth.users(id,name,email) VALUES ($1,$2,$3)", [id, name.trim(), normalizedEmail]);
    await client.query("INSERT INTO cms_auth.accounts(id,account_id,provider_id,user_id,password) VALUES ($1,$2,'credential',$2,$3)", [randomUUID(), id, digest]);
    await client.query("INSERT INTO cms_auth.roles(user_id,role) VALUES ($1,$2)", [id, role]);
    await client.query("INSERT INTO cms_auth.audit(user_id,event) VALUES ($1,'provision')", [id]);
    await client.query("COMMIT");
    return { id, role };
  } catch {
    await client.query("ROLLBACK");
    throw new Error("Account was not created; inspect duplicate email or local database state. No existing account was changed.");
  }
};
