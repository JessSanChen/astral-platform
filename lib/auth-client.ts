"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createAuthClient } from "better-auth/react";
import { adminClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  plugins: [adminClient()],
});

export const { signIn, signUp, signOut } = authClient;

/**
 * Sends someone who is already signed in away from the sign-in and sign-up
 * pages. Every tab shares one session, and a form there invites the belief
 * that a browser can hold two accounts at once.
 *
 * It asks the server whether the session still exists, and does not take
 * the browser's own short-lived copy for an answer. That copy outlives a
 * session ended from elsewhere (an organizer setting a new password, a
 * password changed on another device) by up to half a minute, and for that
 * half minute this page would send the person to the app, the app would
 * send them straight back here, and the two would go round and round.
 */
export function useLeaveIfSignedIn() {
  const router = useRouter();
  useEffect(() => {
    let cancelled = false;
    authClient
      .getSession({ query: { disableCookieCache: true } })
      .then(({ data }) => {
        if (!cancelled && data) router.replace("/chat");
      })
      .catch(() => {
        // Could not ask. Showing the form is the harmless answer.
      });
    return () => {
      cancelled = true;
    };
  }, [router]);
}
