import { defineConfig } from "drizzle-kit";
import { getDatabaseConfig } from "./src/server/db/config.mjs";

// No credentials are needed for offline schema work. No dotenv dependency:
// provide environment variables explicitly when credentials are provisioned.
const credentials = process.env.DATABASE_URL
  ? { dbCredentials: { url: getDatabaseConfig().connectionString } }
  : {};

export default defineConfig({
  dialect: "postgresql",
  schema: ["./src/server/db/schema.mjs", "./src/server/db/auth-schema.mjs"],
  out: "./drizzle",
  strict: true,
  verbose: false,
  ...credentials,
});
