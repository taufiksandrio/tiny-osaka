import { getPublicDatabaseConfig } from "../public/config.mjs";

export const getAuthConfig = (env = process.env) => {
  const secret = env.BETTER_AUTH_SECRET;
  const value = env.BETTER_AUTH_URL || "http://localhost:3000";
  let url;
  try { url = new URL(value); } catch { throw new Error("Invalid local authentication configuration."); }
  if (typeof secret !== "string" || secret.length < 32 || secret === "REPLACE_LOCALLY" ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    !["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error("Invalid local authentication configuration.");
  }
  return { secret, baseURL: url.origin, database: getPublicDatabaseConfig(env) };
};
