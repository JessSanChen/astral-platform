import { readFileSync } from "node:fs";
import { defineConfig } from "drizzle-kit";

/**
 * Load .env.local for the drizzle commands.
 *
 * The scripts run through tsx pass --env-file, but drizzle-kit starts its own
 * process and reads neither that nor .env.local on its own, so `db:migrate`
 * would fail with "url: undefined" even though the value was sitting in the
 * file. Loading it here keeps every database command working the same way.
 */
function loadEnvLocal() {
  if (process.env.DATABASE_URL) return;
  for (const file of [".env.local", ".env"]) {
    try {
      for (const line of readFileSync(file, "utf8").split("\n")) {
        const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
        if (!match) continue;
        const [, key, rawValue] = match;
        if (process.env[key]) continue;
        process.env[key] = rawValue.replace(/^["']|["']$/g, "");
      }
    } catch {
      // No such file; try the next one.
    }
  }
}

loadEnvLocal();

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
