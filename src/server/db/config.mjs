const invalid = () => new Error("Invalid local database configuration; check the environment template.");

// dev/test stay loopback-only. staging/production (Railway) additionally accept private-network hosts
// (*.railway.internal) or hostnames listed explicitly in DATABASE_HOST_ALLOWLIST. Anything else fails closed.
export const localTargets = Object.freeze(["dev", "test"]);
export const remoteTargets = Object.freeze(["staging", "production"]);
export const isRemoteTarget = target => remoteTargets.includes(target);

const loopbackHosts = ["127.0.0.1", "[::1]"];
const label = "[a-z0-9](?:[a-z0-9-]*[a-z0-9])?";
const hostnamePattern = new RegExp(`^${label}(?:\\.${label})*$`);
const privateHostPattern = new RegExp(`^${label}(?:\\.${label})*\\.railway\\.internal$`);

const allowedRemoteHosts = env => String(env.DATABASE_HOST_ALLOWLIST ?? "").split(",")
  .map(host => host.trim().toLowerCase()).filter(host => host && hostnamePattern.test(host) && !host.includes("localhost"));

// Validates a PostgreSQL URL for a target and role suffix. Returns true/false; never throws, never logs the value.
export const isValidDatabaseUrl = (value, target, roles, env = process.env) => {
  if (!localTargets.includes(target) && !isRemoteTarget(target)) return false;
  let url;
  try { url = new URL(value); } catch { return false; }
  const remote = isRemoteTarget(target);
  const hostOk = loopbackHosts.includes(url.hostname) ||
    (remote && (privateHostPattern.test(url.hostname) || allowedRemoteHosts(env).includes(url.hostname)));
  const portOk = remote ? !url.port || (/^\d{1,5}$/.test(url.port) && Number(url.port) >= 1 && Number(url.port) <= 65535) : !url.port || url.port === "5432";
  return ["postgres:", "postgresql:"].includes(url.protocol) && hostOk && portOk &&
    url.pathname === `/tiny_osaka_${target}` && new RegExp(`^tiny_osaka_${target}_(${roles.join("|")})$`).test(url.username) &&
    Boolean(url.password) && url.password !== "REPLACE_LOCALLY" && (!remote || url.password.length >= 16) &&
    !url.search && !url.hash;
};

export const getDatabaseConfig = (env = process.env, target = "dev") => {
  if (!localTargets.includes(target) && !isRemoteTarget(target)) throw invalid();
  const value = env[target === "test" ? "TEST_DATABASE_URL" : "DATABASE_URL"];
  if (typeof value !== "string" || !value.trim()) throw invalid();
  if (!isValidDatabaseUrl(value, target, ["app", "migrator"], env)) throw invalid();

  return {
    connectionString: value,
    max: 2,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 10000,
    application_name: `tiny-osaka-${target}`,
  };
};
