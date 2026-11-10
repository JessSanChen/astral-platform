import { defineConfig } from "drizzle-kit";
import { loadLocalEnv } from "./scripts/load-env.mjs";

// The scripts run through tsx pass --env-file, but drizzle-kit starts its own
// process and reads neither that nor .env.local on its own, so `db:migrate`
// would fail with "url: undefined" even though the value was sitting in the
// file. Loading it here keeps every database command working the same way.
loadLocalEnv();

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.",
  );
}

export default defineConfig({
  schema: "./db/schema.ts",
  out: "./db/migrations",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL },
});
