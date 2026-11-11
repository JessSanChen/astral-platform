/**
 * Keeps the end-to-end tests away from a database they should not touch.
 *
 * Before any test runs, the suite reopens nominations, clears the closing
 * time, unpauses chat and deletes accounts at its test domain. Against the
 * live event that is an incident. The tests take their database from the
 * environment, and a connection string exported in a shell wins over the
 * env files, so "it reads .env.test.local" was never a guarantee.
 *
 * Two checks, used together:
 *
 *  - The database must not be the one in .env.production.local.
 *  - It must carry a marker that only `npm run test:e2e:prepare` creates.
 *    Preparing is the deliberate act of saying "tests may change this one",
 *    and it is refused for the production database, so production can never
 *    acquire the marker by that route.
 */
import { readFileSync } from "node:fs";

/** The table whose existence says tests may use this database. */
export const MARKER_TABLE = "e2e_tests_allowed";

function identity(url) {
  try {
    const u = new URL(url);
    // The pooled and direct addresses of one Neon database differ only by
    // "-pooler" in the host, and are the same database.
    return `${u.hostname.replace("-pooler", "")}${u.pathname}`.toLowerCase();
  } catch {
    return null;
  }
}

/** The production address, read without loading it into the environment. */
function productionUrl() {
  let contents;
  try {
    contents = readFileSync(".env.production.local", "utf8");
  } catch {
    return null;
  }
  const match = contents.match(/^\s*DATABASE_URL\s*=\s*(.*)\s*$/m);
  return match ? match[1].replace(/^["']|["']$/g, "") : null;
}

/** Throws if `url` is the production database. */
export function assertNotProduction(url) {
  const production = productionUrl();
  if (production && identity(production) && identity(production) === identity(url)) {
    throw new Error(
      "Refusing to continue: this is the database in .env.production.local.\n" +
        "The end-to-end tests delete accounts and change event settings. Point them at\n" +
        "a database of their own, in .env.test.local.",
    );
  }
}

/** Throws unless `sql` (a postgres client) is connected to a prepared database. */
export async function assertPrepared(sql) {
  const [row] = await sql`select to_regclass(${"public." + MARKER_TABLE}) as marker`;
  if (!row?.marker) {
    throw new Error(
      "This database has not been set aside for tests.\n" +
        "The suite deletes accounts and changes event settings, so it only runs against\n" +
        "a database that has been prepared for it. If this one is yours to use that way:\n\n" +
        "    npm run test:e2e:prepare\n",
    );
  }
}

/** Marks a database as one the tests may use. */
export async function markPrepared(sql) {
  await sql.unsafe(
    `create table if not exists ${MARKER_TABLE} (prepared_at timestamptz not null default now())`,
  );
}
