import { sql } from "drizzle-orm";
import { pgSchema, text, timestamp, boolean, integer, uuid, index, check, unique } from "drizzle-orm/pg-core";

export const authSchema = pgSchema("cms_auth");
const date = name => timestamp(name, { withTimezone: true });
const dates = () => ({ createdAt: date("created_at").notNull().defaultNow(), updatedAt: date("updated_at").notNull().defaultNow() });
export const user = authSchema.table("users", {
  id: text("id").primaryKey(), name: text("name").notNull(), email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false), image: text("image"),
  twoFactorEnabled: boolean("two_factor_enabled").notNull().default(false), ...dates(),
});
export const account = authSchema.table("accounts", {
  id: text("id").primaryKey(), accountId: text("account_id").notNull(), providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  password: text("password"), accessToken: text("access_token"), refreshToken: text("refresh_token"), idToken: text("id_token"),
  accessTokenExpiresAt: date("access_token_expires_at"), refreshTokenExpiresAt: date("refresh_token_expires_at"), scope: text("scope"), ...dates(),
}, table => [unique("credential_identity").on(table.providerId, table.accountId), index("account_user").on(table.userId)]);
export const session = authSchema.table("sessions", {
  id: text("id").primaryKey(), token: text("token").notNull().unique(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  expiresAt: date("expires_at").notNull(), ipAddress: text("ip_address"), userAgent: text("user_agent"), ...dates(),
}, table => [index("session_user").on(table.userId),
  check("absolute_session_limit", sql`${table.expiresAt} <= ${table.createdAt} + interval '24 hours'`)]);
export const verification = authSchema.table("verifications", {
  id: text("id").primaryKey(), identifier: text("identifier").notNull(), value: text("value").notNull(),
  expiresAt: date("expires_at").notNull(), ...dates(),
}, table => [index("verification_identifier").on(table.identifier)]);
export const twoFactor = authSchema.table("two_factors", {
  id: text("id").primaryKey(), userId: text("user_id").notNull().unique().references(() => user.id, { onDelete: "cascade" }),
  secret: text("secret").notNull(), backupCodes: text("backup_codes").notNull(), verified: boolean("verified").default(true),
  failedVerificationCount: integer("failed_verification_count").default(0), lockedUntil: date("locked_until"),
});
// Roles are read-only for the runtime login. No role field is accepted from a client.
export const roles = authSchema.table("roles", {
  userId: text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  role: text("role").notNull(), enabled: boolean("enabled").notNull().default(true),
}, table => [check("internal_role", sql`${table.role} IN ('owner','staff')`)]);
export const activity = authSchema.table("session_activity", {
  sessionId: text("session_id").primaryKey().references(() => session.id, { onDelete: "cascade" }),
  lastActiveAt: date("last_active_at").notNull(),
});
export const limits = authSchema.table("request_limits", {
  key: text("key").primaryKey(), count: integer("count").notNull(), windowStart: date("window_start").notNull(),
});
export const audit = authSchema.table("audit", {
  id: uuid("id").defaultRandom().primaryKey(), userId: text("user_id"), event: text("event").notNull(),
  createdAt: date("created_at").notNull().defaultNow(),
}, table => [check("auth_event", sql`${table.event} IN ('provision','login_success','login_failed','logout','session_expired','reset_requested','password_reset','password_changed','mfa_enabled','mfa_disabled','mfa_verified','email_verified','rate_limited')`)]);

// MCP Owner OAuth (docs/specs/mcp-owner.md section 6). Public clients only; codes/tokens are stored as SHA-256 hashes.
// The CMS runtime role has no grant on any of these tables. mcp_audit is append-only (INSERT only for the app role).
export const mcpEvents = ["client_created", "client_disabled", "authorize_approved", "authorize_denied", "authorize_rejected", "code_issued", "code_replay",
  "token_issued", "token_refreshed", "token_revoked", "reuse_detected", "tool_call", "request_denied", "rate_limited", "family_revoked"];
export const oauthClients = authSchema.table("oauth_clients", {
  id: uuid("id").defaultRandom().primaryKey(), clientId: text("client_id").notNull().unique(), name: text("name").notNull(),
  redirectUris: text("redirect_uris").array().notNull(), authMethod: text("auth_method").notNull().default("none"),
  createdBy: text("created_by").notNull().references(() => user.id, { onDelete: "cascade" }),
  disabledAt: date("disabled_at"), createdAt: date("created_at").notNull().defaultNow(),
}, table => [check("oauth_client_public_only", sql`${table.authMethod} = 'none'`),
  check("oauth_client_name", sql`char_length(${table.name}) BETWEEN 1 AND 80`),
  check("oauth_client_redirects", sql`cardinality(${table.redirectUris}) BETWEEN 1 AND 5`)]);
export const oauthCodes = authSchema.table("oauth_codes", {
  codeHash: text("code_hash").primaryKey(), clientId: text("client_id").notNull().references(() => oauthClients.clientId, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }), familyId: uuid("family_id").notNull(),
  redirectUri: text("redirect_uri").notNull(), codeChallenge: text("code_challenge").notNull(), challengeMethod: text("challenge_method").notNull(),
  scope: text("scope").notNull(), resource: text("resource").notNull(), expiresAt: date("expires_at").notNull(),
  usedAt: date("used_at"), createdAt: date("created_at").notNull().defaultNow(),
}, table => [index("oauth_code_expiry").on(table.expiresAt),
  check("oauth_code_s256", sql`${table.challengeMethod} = 'S256' AND ${table.codeChallenge} ~ '^[A-Za-z0-9_-]{43}$'`),
  check("oauth_code_ttl", sql`${table.expiresAt} <= ${table.createdAt} + interval '60 seconds'`)]);
export const oauthTokens = authSchema.table("oauth_tokens", {
  id: uuid("id").defaultRandom().primaryKey(), tokenHash: text("token_hash").notNull().unique(), kind: text("kind").notNull(),
  familyId: uuid("family_id").notNull(), clientId: text("client_id").notNull().references(() => oauthClients.clientId, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }), scope: text("scope").notNull(), resource: text("resource").notNull(),
  expiresAt: date("expires_at").notNull(), familyExpiresAt: date("family_expires_at").notNull(), lastUsedAt: date("last_used_at"),
  revokedAt: date("revoked_at"), replacedBy: uuid("replaced_by"), createdAt: date("created_at").notNull().defaultNow(),
}, table => [index("oauth_token_family").on(table.familyId), index("oauth_token_user").on(table.userId), index("oauth_token_client").on(table.clientId),
  check("oauth_token_kind", sql`${table.kind} IN ('access','refresh')`),
  check("oauth_token_bounds", sql`${table.expiresAt} <= ${table.familyExpiresAt} AND ${table.familyExpiresAt} <= ${table.createdAt} + interval '24 hours 1 minute'`)]);
export const mcpAudit = authSchema.table("mcp_audit", {
  id: uuid("id").defaultRandom().primaryKey(), at: date("at").notNull().defaultNow(), userId: text("user_id"), clientId: text("client_id"),
  event: text("event").notNull(), tool: text("tool"), target: text("target"), outcome: text("outcome").notNull(), code: text("code"), requestId: text("request_id"),
}, table => [index("mcp_audit_at").on(table.at),
  check("mcp_audit_event", sql.raw(`"cms_auth"."mcp_audit"."event" IN (${mcpEvents.map(name => `'${name}'`).join(",")})`)),
  check("mcp_audit_outcome", sql`${table.outcome} IN ('ok','denied','error')`),
  check("mcp_audit_lengths", sql`char_length(coalesce(${table.target},'')) <= 200 AND char_length(coalesce(${table.code},'')) <= 64 AND char_length(coalesce(${table.tool},'')) <= 64`)]);
