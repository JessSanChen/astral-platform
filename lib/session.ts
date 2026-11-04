import { headers } from "next/headers";
import { cache } from "react";
import { auth } from "@/lib/auth";

// Cached per-request so multiple calls in one render hit the DB once.
export const getSession = cache(async () => {
  return auth.api.getSession({ headers: await headers() });
});
