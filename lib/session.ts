import { headers } from "next/headers";
import { cache } from "react";
import { auth } from "@/lib/auth";

/**
 * The current session, cached per request so several components reading it
 * cost one lookup.
 *
 * The session normally comes from a short-lived signed cookie rather than the
 * database, which removes a round trip from most page loads. That copy can be
 * a few seconds behind, which matters in one direction: a participant who has
 * just finished onboarding would otherwise be sent straight back to it. So
 * whenever the cached copy says the participant cannot proceed, it is
 * confirmed against the database before acting on it. See lib/auth.ts for the
 * tradeoff in the other direction.
 */
export const getSession = cache(async () => {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session) return null;

  const user = session.user as typeof session.user & {
    banned?: boolean | null;
    profileCompletedAt?: Date | string | null;
    termsAcceptedAt?: Date | string | null;
  };
  const looksBlocked =
    user.banned === true || !user.profileCompletedAt || !user.termsAcceptedAt;
  if (!looksBlocked) return session;

  return getFreshSession();
});

/**
 * The session read from the database, ignoring the cookie's copy.
 *
 * For the cases where the cached copy says someone cannot proceed and that
 * may simply be out of date. Cached per request like the one above.
 */
export const getFreshSession = cache(async () => {
  return auth.api.getSession({
    headers: await headers(),
    query: { disableCookieCache: true },
  });
});
