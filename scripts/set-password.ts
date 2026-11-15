/**
 * Sets a temporary password for one account, from the command line.
 *
 *   npm run prod:set-password -- someone@example.com
 *
 * For when nobody can do it from the console: the last organizer is locked
 * out, or an organizer's own password is one the site no longer accepts and
 * there is no other organizer to ask. It needs the database credentials,
 * which is the check on who may run it.
 *
 * It does what an organizer setting a password from the console does: the
 * account is signed out everywhere, any lock from wrong guesses is lifted,
 * and the password works once, to choose a real one. A password is made up
 * and printed; nothing is asked for, so nothing weak can be typed.
 */
import { randomInt } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { db } from "@/db";
import { account, session, user } from "@/db/schema";
import { recordAudit } from "@/lib/audit";

const WORDS = [
  "amber", "birch", "cedar", "delta", "ember", "fjord", "grove", "harbor",
  "island", "juniper", "kestrel", "lagoon", "meadow", "nectar", "orchard",
  "pebble", "quartz", "ridge", "saffron", "thistle", "upland", "violet",
  "willow", "yarrow", "zephyr", "copper", "lantern", "marble", "pocket", "river",
];

/** Four words and a number: easy to read out, long enough for an organizer. */
function temporaryPassword() {
  const pick = () => WORDS[randomInt(WORDS.length)];
  return `${pick()}-${pick()}-${pick()}-${pick()}-${randomInt(10, 100)}`;
}

async function main() {
  const email = (process.argv[2] ?? "").trim().toLowerCase();
  if (!email) {
    console.error("\nUsage: npm run prod:set-password -- <email>\n");
    process.exit(1);
  }

  const [target] = await db
    .select({ id: user.id, name: user.name, email: user.email, role: user.role })
    .from(user)
    .where(eq(user.email, email));
  if (!target) {
    console.error(`\nNo account with the address ${email}.\n`);
    process.exit(1);
  }

  const password = temporaryPassword();
  const updated = await db
    .update(account)
    .set({ password: await hashPassword(password), updatedAt: new Date() })
    .where(and(eq(account.userId, target.id), eq(account.providerId, "credential")))
    .returning({ id: account.id });
  if (updated.length === 0) {
    console.error(`\n${email} has no password to replace. Nothing was changed.\n`);
    process.exit(1);
  }

  await db.delete(session).where(eq(session.userId, target.id));
  await db
    .update(user)
    .set({ mustChangePassword: true, failedSignIns: 0, lockedUntil: null, updatedAt: new Date() })
    .where(eq(user.id, target.id));
  await recordAudit({
    action: "password_set",
    target,
    detail: "From the command line, with the database credentials.",
  });

  console.log(`
  ${target.name} <${target.email}>${target.role === "admin" ? " (organizer)" : ""}

  Temporary password:   ${password}

  They have been signed out everywhere. It works once: on signing in they
  are asked to choose their own.
`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
