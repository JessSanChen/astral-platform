import { removeTestAccounts, sql } from "./db";

/**
 * Runs once before the tests: checks the database is usable and starts from
 * a known state.
 */
export default async function globalSetup() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "No DATABASE_URL. Put one in .env.test.local (or .env.local) and run: npm run test:e2e:prepare",
    );
  }
  // Say where this is going, without the password. The mistake worth
  // guarding against is the right tests against the wrong database.
  const { hostname, pathname } = new URL(url);
  console.log(`\n  e2e database: ${hostname}${pathname}\n`);

  let settings;
  try {
    settings = await sql`select event_code from event_settings where id = 1`;
  } catch {
    throw new Error(
      "The test database has no tables yet. Run: npm run test:e2e:prepare",
    );
  }
  if (settings.length === 0) {
    throw new Error("The test database is not seeded. Run: npm run test:e2e:prepare");
  }

  await removeTestAccounts();
  // Settings the suite assumes. A run that died halfway may have left the
  // nomination deadline in place.
  await sql`
    update event_settings
    set nominations_locked = false, nominations_close_at = null, chat_paused = false
    where id = 1
  `;
  // The connection is left to close itself when idle. Teardown runs in this
  // same process and uses it again.
}
