import { eq } from "drizzle-orm";
import { db } from "@/db";
import { eventSettings } from "@/db/schema";

export { EVENT_CODE_HEADER } from "@/lib/event-code-header";

export const EVENT_CODE_REJECTED =
  "That event code is not valid. Ask the organizer for today's code.";

// Constant-time compare, so the code cannot be worked out from how long a
// wrong guess takes to be refused.
function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

/**
 * Whether a code is today's event code.
 *
 * Read from the database on every call rather than from the cached settings,
 * so changing the code in the organizer console stops sign-ups at once
 * instead of a few seconds later on some servers and not others.
 */
export async function eventCodeMatches(code: unknown): Promise<boolean> {
  if (typeof code !== "string") return false;
  const [settings] = await db
    .select({ eventCode: eventSettings.eventCode })
    .from(eventSettings)
    .where(eq(eventSettings.id, 1));
  const expected = settings?.eventCode ?? process.env.EVENT_CODE ?? "";
  // No code configured means nobody gets in, not everybody.
  if (!expected) return false;
  return timingSafeEqual(code.trim(), expected);
}
