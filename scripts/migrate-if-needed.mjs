/**
 * Applies any pending migrations before the dev server starts.
 *
 * Pulling a change that adds a column and forgetting to migrate shows up as a
 * runtime error deep inside a query, which is a slow and confusing way to
 * find out. Running this first turns that into a one-line message at startup,
 * or more often into nothing at all.
 *
 * Development only: it is wired to `npm run dev`, never to a deployment,
 * where migrations are applied deliberately as part of releasing.
 */
import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import postgres from "postgres";
import { loadLocalEnv } from "./load-env.mjs";

loadLocalEnv();

if (!process.env.DATABASE_URL) {
  console.error(
    "\nDATABASE_URL is not set. Copy .env.example to .env.local and fill it in.\n",
  );
  process.exit(1);
}

const migrationFiles = readdirSync(join(process.cwd(), "db", "migrations")).filter(
  (f) => f.endsWith(".sql"),
);

const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
let applied = 0;
try {
  const rows = await sql`
    select count(*)::int as count from drizzle.__drizzle_migrations
  `;
  applied = rows[0]?.count ?? 0;
} catch {
  applied = 0; // the table does not exist yet, so nothing has been applied
} finally {
  await sql.end();
}

if (applied >= migrationFiles.length) process.exit(0);

const pending = migrationFiles.length - applied;
console.log(
  `\nApplying ${pending} new database migration${pending === 1 ? "" : "s"} before starting...\n`,
);
const result = spawnSync("npx", ["drizzle-kit", "migrate"], {
  stdio: "inherit",
  shell: process.platform === "win32",
});
if (result.status !== 0) {
  console.error(
    "\nCould not apply migrations. Fix the problem above, then run: npm run db:migrate\n",
  );
  process.exit(1);
}
