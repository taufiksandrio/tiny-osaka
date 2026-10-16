import { connectDevOwner } from "./lib/dev-db.mjs";
import { provisionAccount } from "../src/server/auth/provision.mjs";

let owner;
try {
  let input = "";
  for await (const chunk of process.stdin) {
    input += chunk;
    if (input.length > 4096) throw new Error();
  }
  const fields = JSON.parse(input.replace(/^\uFEFF/, "")); input = "";
  owner = await connectDevOwner();
  await provisionAccount({ client: owner, ...fields });
  fields.password = "";
  console.log("Internal account created. Email ownership is not yet verified. Sign in at /admin/login.");
} catch { console.error("Account setup failed; no credentials logged. Check input or an existing account; no overwrite was performed."); process.exitCode = 1; }
finally { if (owner) await owner.end(); }
