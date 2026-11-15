import { sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/schema";
import { recordAudit } from "@/lib/audit";

/** Password attempts in a row before the account stops listening. */
export const MAX_FAILED_SIGN_INS = 8;
/** How long it then stops for. */
export const SIGN_IN_LOCK_MINUTES = 5;

type Attempt = { allowed: true } | { allowed: false; minutes: number };

/**
 * Takes one of an account's password attempts, or says there are none left.
 *
 * Called before a password is checked, wherever one is: signing in, and
 * giving the current password in order to change it. The attempt is counted
 * here, up front, and given back afterwards if the password was right.
 *
 * Counting afterwards, when the password has turned out wrong, is the
 * obvious way and does not work. Checking a password takes a moment, and a
 * hundred attempts sent together would all be let through before the first
 * of them had been counted. Here each attempt takes the account's row,
 * counts itself and lets go before any checking starts, so the ninth to
 * arrive finds eight already taken however close together they came.
 *
 * `who` picks the account, by address or by id. An account that does not
 * exist is always allowed: there is nothing to protect, and refusing would
 * tell a stranger which addresses have accounts.
 */
export async function takePasswordAttempt(who: SQL): Promise<Attempt> {
  const rows = await db.execute<{
    id: string;
    name: string;
    email: string;
    was_locked: boolean;
    locked_until: Date | null;
    now: Date;
  }>(sql`
    with account as (
      select id, failed_sign_ins, locked_until
      from ${user} where ${who}
      for update
    )
    update ${user} u set
      failed_sign_ins = case
        when account.locked_until > now() then account.failed_sign_ins
        when account.failed_sign_ins >= ${MAX_FAILED_SIGN_INS} then 0
        else account.failed_sign_ins + 1
      end,
      locked_until = case
        when account.locked_until > now() then account.locked_until
        when account.failed_sign_ins >= ${MAX_FAILED_SIGN_INS}
          then now() + make_interval(mins => ${SIGN_IN_LOCK_MINUTES})
        else null
      end
    from account
    where u.id = account.id
    returning
      u.id, u.name, u.email,
      coalesce(account.locked_until > now(), false) as was_locked,
      u.locked_until,
      now() as now
  `);
  const [row] = rows as unknown as {
    id: string;
    name: string;
    email: string;
    was_locked: boolean;
    locked_until: Date | string | null;
    now: Date | string;
  }[];
  if (!row || !row.locked_until) return { allowed: true };

  const until = new Date(row.locked_until).getTime();
  const now = new Date(row.now).getTime();
  if (until <= now) return { allowed: true };

  // Locked. If it was this attempt that did it, say so on the record, once.
  if (!row.was_locked) {
    await recordAudit({
      action: "sign_in_locked",
      target: row,
      detail: `More than ${MAX_FAILED_SIGN_INS} password attempts in a row; locked for ${SIGN_IN_LOCK_MINUTES} minutes.`,
    });
  }
  return { allowed: false, minutes: Math.max(1, Math.ceil((until - now) / 60_000)) };
}

/** What someone is told when there are no attempts left. */
export function lockedMessage(minutes: number) {
  return `Too many wrong passwords for this account. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}, or ask an organizer to set a new password.`;
}

/**
 * Gives one attempt back.
 *
 * For an attempt that failed for a reason other than the password being
 * wrong, such as a paused account signing in with the right one. Counting
 * those would lock people out, and tell the organizers about wrong
 * passwords, when nobody had guessed at anything.
 */
export async function returnPasswordAttempt(who: SQL) {
  await db.execute(sql`
    update ${user} set failed_sign_ins = greatest(failed_sign_ins - 1, 0)
    where ${who}
  `);
}

/** The account with this address. Addresses are stored in lower case. */
export const byEmail = (email: string) => sql`email = ${email.trim().toLowerCase()}`;
/** The account with this id. */
export const byId = (id: string) => sql`id = ${id}`;
