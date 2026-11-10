import { removeTestAccounts, sql } from "./db";

export default async function globalTeardown() {
  await removeTestAccounts();
  await sql`
    update event_settings
    set nominations_locked = false, nominations_close_at = null
    where id = 1
  `;
  await sql.end();
}
