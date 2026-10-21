import "server-only";

// Fixed-window limits backed by the HMAC counters of the auth service (cms_auth.request_limits).
export const MCP_RULES = Object.freeze({
  authorize: Object.freeze({ window: 60, max: 20 }),
  token: Object.freeze({ window: 60, max: 20 }),
  revoke: Object.freeze({ window: 60, max: 20 }),
  call: Object.freeze({ window: 60, max: 60 }),
  write: Object.freeze({ window: 60, max: 20 }),
});

export const createLimits = ({ consume, audit }) => {
  const hit = async (name, subject, { userId = null, clientId = null } = {}) => {
    const result = await consume(`mcp:${name}:${subject}`, MCP_RULES[name]);
    if (!result.allowed) await audit.safe({ userId, clientId, event: "rate_limited", tool: name, outcome: "denied", code: "RATE_LIMITED" });
    return result;
  };
  return Object.freeze({ hit });
};
export const limitedResponse = (retryAfter, body = { error: "rate_limited" }) =>
  Response.json(body, { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": String(retryAfter ?? 60) } });
