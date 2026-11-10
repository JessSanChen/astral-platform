import { redirect } from "next/navigation";
import { cache } from "react";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { termsVersion } from "@/db/schema";
import { getFreshSession, getSession } from "@/lib/session";
import { CACHE_KEYS, cached } from "@/lib/cache";

/**
 * The newest published terms version. Cached briefly because it is read on
 * every page load and changes only when an admin publishes new terms.
 */
export async function getLatestTermsVersion(): Promise<number> {
  return cached(CACHE_KEYS.latestTermsVersion, 10_000, async () => {
    const [row] = await db
      .select({ version: termsVersion.version })
      .from(termsVersion)
      .orderBy(desc(termsVersion.version))
      .limit(1);
    return row?.version ?? 0;
  });
}

/** The application columns we add to the session user in lib/auth.ts. */
type AppUserFields = {
  isPaused?: boolean | null;
  dailyTokenBudget?: number | null;
  judgeRunsPerHour?: number | null;
  termsVersion?: number | null;
  termsAcceptedAt?: Date | string | null;
  profileCompletedAt?: Date | string | null;
};

/**
 * The signed-in user with the app's own fields, plus the latest published
 * terms version. Cached per request.
 */
export const getCurrentUser = cache(async () => {
  let session = await getSession();
  if (!session) return null;
  // The session already carries the user row, including our own columns (see
  // lib/auth.ts), so there is no second read of the same row here. On a
  // hosted database that saved round trip is on every page load.
  let u = session.user as typeof session.user & AppUserFields;
  const latestTermsVersion = await getLatestTermsVersion();

  // The session is cached in a cookie for half a minute, and whenever that
  // copy says someone cannot proceed it is confirmed against the database
  // first (see lib/session.ts). Being behind on the terms is one of those
  // cases, and the only one that needs the latest version to recognise, so
  // it is handled here. Without it, accepting newly published terms sent the
  // participant straight back to the same page, again and again, until the
  // cookie expired.
  if (u.termsAcceptedAt && (u.termsVersion ?? 0) < latestTermsVersion) {
    const fresh = await getFreshSession();
    if (!fresh) return null;
    session = fresh;
    u = fresh.user as typeof fresh.user & AppUserFields;
  }

  return {
    session,
    user: u,
    latestTermsVersion,
    needsProfile: !u.profileCompletedAt,
    // Re-gate whenever a newer terms version has been published.
    needsTerms: !u.termsAcceptedAt || (u.termsVersion ?? 0) < latestTermsVersion,
    isAdmin: u.role === "admin",
  };
});

/** For participant pages: must be signed in and fully onboarded. */
export async function requireOnboarded() {
  const cu = await getCurrentUser();
  if (!cu) redirect("/sign-in");
  if (cu.user.banned) redirect("/paused");
  if (cu.needsProfile || cu.needsTerms) redirect("/onboarding");
  return cu;
}

/** For admin pages. */
export async function requireAdmin() {
  const cu = await getCurrentUser();
  if (!cu) redirect("/sign-in");
  // Pausing an account stops it, whatever its role.
  if (cu.user.banned) redirect("/paused");
  if (!cu.isAdmin) redirect("/chat");
  return cu;
}
