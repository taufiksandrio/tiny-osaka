import { getDatabaseConfig } from "../db/config.mjs";
import { isIndexingOpen } from "./indexing.mjs";

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

// GA4 (ADR-041). Server-only env (never NEXT_PUBLIC_). The measurement id is not a secret but is only handed to the client
// as a prop when active. Active only when indexing is open (production + flag + valid SITE_URL) and the id is well formed.
const GA4_ID = /^G-[A-Z0-9]{4,20}$/;
export const getAnalyticsConfig = (env = process.env) => {
  const id = typeof env.GA4_MEASUREMENT_ID === "string" ? env.GA4_MEASUREMENT_ID.trim() : "";
  if (!GA4_ID.test(id) || !isIndexingOpen(env)) return Object.freeze({ enabled: false, measurementId: null });
  return Object.freeze({ enabled: true, measurementId: id });
};
export const isAnalyticsEnabled = (env = process.env) => getAnalyticsConfig(env).enabled;
