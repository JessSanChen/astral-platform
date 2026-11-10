import postgres from "postgres";

/**
 * Direct access to the test database, for the few things a test cannot do
 * through the interface: becoming the first organizer, and checking what was
 * actually stored. Everything a participant can do is done in the browser.
 */
export const sql = postgres(process.env.DATABASE_URL!, {
  max: 1,
  prepare: false,
  idle_timeout: 5,
  onnotice: () => {},
});

/** Every account the suite creates lives at this domain, so it can be found. */
export const TEST_DOMAIN = "e2e.test";

export async function eventCode(): Promise<string> {
  const [row] = await sql`select event_code from event_settings where id = 1`;
  return row.event_code as string;
}

export async function promoteToOrganizer(email: string) {
  await sql`update "user" set role = 'admin' where email = ${email}`;
}

export async function userId(email: string): Promise<string> {
  const [row] = await sql`select id from "user" where email = ${email}`;
  return row.id as string;
}

/** Removes everything the suite created, and anything that left behind. */
export async function removeTestAccounts() {
  await sql`delete from "user" where email like ${"%@" + TEST_DOMAIN}`;
  // A transcript is locked when reviewed; with the reviewer gone it must not
  // stay locked.
  await sql`
    update conversation set locked_at = null
    where locked_at is not null
      and not exists (select 1 from review r where r.conversation_id = conversation.id)
  `;
}
