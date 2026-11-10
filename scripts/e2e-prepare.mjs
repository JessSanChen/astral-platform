/**
 * Gets the end-to-end test database ready: tables, then seed data.
 *
 * Uses the same database the tests will: DATABASE_URL from .env.test.local
 * if there is one, otherwise from .env.local. Safe to run again.
 */
import { spawnSync } from "node:child_process";
import { loadEnvFile } from "./load-env.mjs";

const usedTestFile = loadEnvFile(".env.test.local");
loadEnvFile(".env.local");

if (!process.env.DATABASE_URL) {
  console.error("\nNo DATABASE_URL in .env.test.local or .env.local.\n");
  process.exit(1);
}
const { hostname, pathname } = new URL(process.env.DATABASE_URL);
console.log(
  `\n  preparing ${hostname}${pathname}` +
    (usedTestFile ? " (from .env.test.local)" : " (from .env.local: your development database)") +
    "\n",
);

for (const command of [
  ["npx", "drizzle-kit", "migrate"],
  ["npx", "tsx", "scripts/seed.ts"],
]) {
  const result = spawnSync(command[0], command.slice(1), {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
