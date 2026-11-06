/**
 * Runs a command with a chosen environment file loaded.
 *
 * Every database command here defaults to .env.local, which is your own
 * development database. Pointing one at production therefore needs an
 * override, and typing the connection string on the command line each time
 * invites exactly the mistake that matters most: a long paste, one character
 * wrong, or the right string in front of the wrong command.
 *
 * So production details live in .env.production.local, which is ignored by
 * git like every other env file, and these commands name the file instead of
 * the string.
 *
 * Before running anything it prints which database is about to be touched.
 * The whole class of accident here is doing the right thing to the wrong
 * database, and the only reliable defence is seeing the name first.
 *
 * Usage: node scripts/with-env.mjs <env-file> <command> [args...]
 */
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const [envFile, ...command] = process.argv.slice(2);

if (!envFile || command.length === 0) {
  console.error("Usage: node scripts/with-env.mjs <env-file> <command> [args...]");
  process.exit(1);
}

let contents;
try {
  contents = readFileSync(envFile, "utf8");
} catch {
  console.error(
    `\n${envFile} does not exist.\n\n` +
      "Create it with the production values, the same shape as .env.example.\n" +
      "It is ignored by git, like every other env file here.\n" +
      "See docs/DEPLOY.md.\n",
  );
  process.exit(1);
}

for (const line of contents.split("\n")) {
  const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
  if (!match) continue;
  const [, key, rawValue] = match;
  // A variable already set in the shell wins, so a one-off override still
  // works without editing the file.
  if (process.env[key]) continue;
  process.env[key] = rawValue.replace(/^["']|["']$/g, "");
}

if (!process.env.DATABASE_URL) {
  console.error(`\n${envFile} has no DATABASE_URL.\n`);
  process.exit(1);
}

// Say where this is going, without printing the password.
try {
  const url = new URL(process.env.DATABASE_URL);
  console.log(
    `\n  ${envFile} → ${url.hostname}${url.pathname}\n  running: ${command.join(" ")}\n`,
  );
} catch {
  console.log(`\n  ${envFile} → (unreadable DATABASE_URL)\n`);
}

const result = spawnSync(command[0], command.slice(1), {
  stdio: "inherit",
  shell: process.platform === "win32",
});
process.exit(result.status ?? 1);
