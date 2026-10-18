import { getPublicDatabaseConfig } from "../public/config.mjs";
import { isRemoteTarget } from "../db/config.mjs";

const localHosts = ["localhost", "127.0.0.1", "[::1]"];
const publicHostPattern = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

export const getAuthConfig = (env = process.env) => {
  const secret = env.BETTER_AUTH_SECRET;
  const remote = isRemoteTarget(env.PUBLIC_DATABASE_TARGET);
  // Remote targets have no localhost default: BETTER_AUTH_URL must be set explicitly.
  const value = env.BETTER_AUTH_URL || (remote ? "" : "http://localhost:3000");
  let url;
  try { url = new URL(value); } catch { throw new Error("Invalid local authentication configuration."); }
  const local = localHosts.includes(url.hostname);
  // staging/production: one HTTPS origin with a DNS name (no IP literal, no port tricks, no path).
  const remoteOrigin = remote && url.protocol === "https:" && publicHostPattern.test(url.hostname) && !/^\d+(\.\d+)*$/.test(url.hostname);
  if (typeof secret !== "string" || secret.length < 32 || secret === "REPLACE_LOCALLY" ||
    !(local || remoteOrigin) ||
    !["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error("Invalid local authentication configuration.");
  }
  return { secret, baseURL: url.origin, database: getPublicDatabaseConfig(env) };
};
