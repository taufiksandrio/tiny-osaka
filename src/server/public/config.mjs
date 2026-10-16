import { getDatabaseConfig } from "../db/config.mjs";

export const getPublicSource = (env = process.env) => {
  const source = env.PUBLIC_CONTENT_SOURCE || "published";
  if (!["published", "fixture"].includes(source)) throw new Error("Invalid public content source.");
  if (source === "fixture" && env.PUBLIC_DATABASE_TARGET === "test") throw new Error("Fixture mode cannot use the published test target.");
  return source;
};

export const getPublicDatabaseConfig = (env = process.env) => {
  const target = env.PUBLIC_DATABASE_TARGET || "dev";
  const config = getDatabaseConfig(env, target);
  if (new URL(config.connectionString).username !== `tiny_osaka_${target}_app`) {
    throw new Error("Public reads require the application database role.");
  }
  return config;
};
