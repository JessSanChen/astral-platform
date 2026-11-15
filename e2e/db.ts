import postgres from "postgres";

/**
 * Direct access to the test database, for the few things a test cannot do
 * through the interface: becoming the first organizer, standing in for an
 * organizer where that is not what is being tested, and checking what was
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

/** The episode a session belongs to. */
export async function episodeOf(sessionId: string): Promise<string> {
  const [row] = await sql`select episode_id from conversation where id = ${sessionId}`;
  return row.episode_id as string;
}

/**
 * What an organizer does on the Submissions page: says who can review a
 * submission and lets it go. Done here where the test is about reviewing,
 * not about the console.
 */
export async function release(
  episodeId: string,
  level: "general" | "routine" | "specialist" = "general",
  domains: string[] = [],
) {
  await sql`
    update episode
    set review_level = ${level}, eligible_domains = ${domains}, assignment_state = 'ready'
    where id = ${episodeId}
  `;
}

/** Marks the instruction check as passed, for the policy now in force. */
export async function passInstructionCheck(email: string) {
  await sql`
    update "user"
    set policy_ready_version = (select max(version) from review_policy)
    where email = ${email}
  `;
}

/** Settings the suite assumes, whatever an earlier run left behind. */
export async function resetSettings() {
  await sql`
    update event_settings
    set nominations_locked = false, nominations_close_at = null, chat_paused = false,
        reviews_per_view = 3, auto_release_submissions = false,
        review_reservation_minutes = 45, comparison_activity_open = true
    where id = 1
  `;
}

/**
 * Removes everything the suite created, and anything that left behind.
 * Episodes, views, assignments and answers all go with the account.
 */
export async function removeTestAccounts() {
  await sql`delete from "user" where email like ${"%@" + TEST_DOMAIN}`;
}
