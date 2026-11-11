import { count, desc, sql } from "drizzle-orm";
import { db } from "@/db";
import { termsVersion, user } from "@/db/schema";

/** Every published version, newest first. */
export async function listTermsVersions() {
  return db
    .select()
    .from(termsVersion)
    .orderBy(desc(termsVersion.version));
}

/**
 * How many accounts have accepted the current version, out of how many
 * exist. After publishing, this is how an organizer sees the room catch up.
 */
export async function termsAcceptance(latestVersion: number) {
  const [row] = await db
    .select({
      total: count(),
      accepted: sql<number>`count(*) filter (where ${user.termsVersion} >= ${latestVersion})::int`,
    })
    .from(user);
  return { total: row?.total ?? 0, accepted: row?.accepted ?? 0 };
}
