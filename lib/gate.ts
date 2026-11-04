import { redirect } from "next/navigation";
import { cache } from "react";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { termsVersion, user as userTable } from "@/db/schema";
import { getSession } from "@/lib/session";

/**
 * Loads the signed-in user's full database row (not just the session copy),
 * plus the latest published terms version. Cached per request.
 */
export const getCurrentUser = cache(async () => {
  const session = await getSession();
  if (!session) return null;
  const [u] = await db
    .select()
    .from(userTable)
    .where(eq(userTable.id, session.user.id));
  if (!u) return null;
  const [latestTerms] = await db
    .select({ version: termsVersion.version })
    .from(termsVersion)
    .orderBy(desc(termsVersion.version))
    .limit(1);
  const latestTermsVersion = latestTerms?.version ?? 0;
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
  if (!cu.isAdmin) redirect("/chat");
  return cu;
}
