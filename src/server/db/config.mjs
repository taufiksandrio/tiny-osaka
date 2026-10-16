const invalid = () => new Error("Invalid local database configuration; check the environment template.");

// Local-only foundation. Remote deployment needs a separate configuration review.
export const getDatabaseConfig = (env = process.env, target = "dev") => {
  if (target !== "dev" && target !== "test") throw invalid();
  const value = env[target === "test" ? "TEST_DATABASE_URL" : "DATABASE_URL"];
  if (typeof value !== "string" || !value.trim()) throw invalid();

  let url;
  try {
    url = new URL(value);
  } catch {
    throw invalid();
  }

  const database = `tiny_osaka_${target}`;
  const username = url.username;
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !["127.0.0.1", "[::1]"].includes(url.hostname) ||
    (url.port && url.port !== "5432") ||
    url.pathname !== `/${database}` ||
    !new RegExp(`^tiny_osaka_${target}_(app|migrator)$`).test(username) ||
    !url.password || url.password === "REPLACE_LOCALLY" ||
    url.search || url.hash
  ) throw invalid();

  return {
    connectionString: value,
    max: 2,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 10000,
    application_name: `tiny-osaka-${target}`,
  };
};
