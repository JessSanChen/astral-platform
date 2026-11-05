import { headers } from "next/headers";
import { cache } from "react";
import { auth } from "@/lib/auth";

/**
 * The current session, read from the database and cached for the duration of
 * one request, so several components reading it cost a single lookup.
 *
 * See lib/auth.ts for why this is not served from a cookie.
 */
export const getSession = cache(async () => {
  return auth.api.getSession({ headers: await headers() });
});
