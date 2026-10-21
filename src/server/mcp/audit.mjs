import "server-only";
import { randomUUID } from "node:crypto";
import { mcpEvents } from "../db/auth-schema.mjs";

// Append-only MCP audit. The app role only has INSERT on this table (no SELECT/UPDATE/DELETE) and a trigger blocks edits.
// Rows carry identifiers and outcomes only: never tokens, codes, verifiers or field content.
const clip = (value, max) => value === undefined || value === null ? null : String(value).slice(0, max);
export const newRequestId = () => randomUUID();

export const createAudit = ({ pool }) => {
  // Strict variant: throws so security decisions (code issuance) fail closed when the audit row cannot be written.
  const record = async ({ userId = null, clientId = null, event, tool = null, target = null, outcome = "ok", code = null, requestId = null }) => {
    if (!mcpEvents.includes(event) || !["ok", "denied", "error"].includes(outcome)) throw new Error("Invalid MCP audit entry.");
    await pool.query("INSERT INTO cms_auth.mcp_audit(user_id,client_id,event,tool,target,outcome,code,request_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
      [clip(userId, 128), clip(clientId, 128), event, clip(tool, 64), clip(target, 200), outcome, clip(code, 64), clip(requestId, 64)]);
  };
  // Best effort for completed work (a committed tool call must still be answered); failure is reported without details.
  const safe = async entry => { try { await record(entry); } catch { console.error("MCP audit write failed."); } };
  return Object.freeze({ record, safe });
};
