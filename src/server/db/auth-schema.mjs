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
