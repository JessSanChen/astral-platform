/**
 * Reads KEY=value files into process.env.
 *
 * Shared by everything that runs outside Next.js and therefore gets no env
 * loading for free: drizzle-kit, the pre-dev migration check, and the prod:
 * commands. Three copies of the same dozen lines had already started to
 * differ in small ways.
 *
 * A variable that is already set is never overwritten, so a value given on
 * the command line always wins over a file.
 */
import { readFileSync } from "node:fs";

/** Loads one file. Returns false if it does not exist. */
export function loadEnvFile(file) {
  let contents;
  try {
    contents = readFileSync(file, "utf8");
  } catch {
    return false;
  }
  for (const line of contents.split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    process.env[key] = rawValue.replace(/^["']|["']$/g, "");
  }
  return true;
}

/**
 * The local development files, in the order Next.js itself prefers them.
 * Does nothing when DATABASE_URL is already set, which is how a one-off
 * command is pointed somewhere else.
 */
export function loadLocalEnv() {
  if (process.env.DATABASE_URL) return;
  for (const file of [".env.local", ".env"]) loadEnvFile(file);
}
