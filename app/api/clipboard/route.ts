import { z } from "zod";
import { and, eq, gte, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { clipboardEvent, conversation, reviewClaim } from "@/db/schema";
import { getCurrentUser, whyBlocked } from "@/lib/gate";
import { CLIPBOARD_KINDS, CLIPBOARD_SURFACES, CLIPBOARD_TEXT_LIMIT } from "@/lib/clipboard";

const bodySchema = z.object({
  conversationId: z.string().uuid(),
  kind: z.enum(CLIPBOARD_KINDS),
  surface: z.enum(CLIPBOARD_SURFACES),
  turn: z.number().int().min(1).max(5000).nullish(),
  role: z.enum(["user", "assistant"]).nullish(),
  // The length of everything copied or pasted; `content` may be cut short.
  charCount: z.number().int().min(1).max(50_000_000),
  content: z.string().max(CLIPBOARD_TEXT_LIMIT),
});

/** More than this in a minute is a script, not a person. */
const PER_MINUTE = 120;

/**
 * Records one copy, cut or paste.
 *
 * The page sends these as they happen and does not wait for the answer, so
 * nothing here can slow anyone down or show them an error. Anything that
 * does not check out is dropped, and says so only in its status code.
 */
export async function POST(req: Request) {
  const cu = await getCurrentUser();
  if (!cu) return new Response(null, { status: 401 });
  if (whyBlocked(cu)) return new Response(null, { status: 403 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return new Response(null, { status: 400 });
  const event = parsed.data;

  // Only for a conversation this person is entitled to be looking at: their
  // own, or one they are holding for review.
  const [[convo], [claim], [recent]] = await Promise.all([
    db
      .select({ userId: conversation.userId })
      .from(conversation)
      .where(eq(conversation.id, event.conversationId)),
    db
      .select({ id: reviewClaim.id })
      .from(reviewClaim)
      .where(
        and(
          eq(reviewClaim.conversationId, event.conversationId),
          eq(reviewClaim.reviewerId, cu.user.id),
          ne(reviewClaim.state, "released"),
        ),
      ),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(clipboardEvent)
      .where(
        and(
          eq(clipboardEvent.userId, cu.user.id),
          gte(clipboardEvent.createdAt, new Date(Date.now() - 60_000)),
        ),
      ),
  ]);
  if (!convo) return new Response(null, { status: 404 });
  if (convo.userId !== cu.user.id && !claim) return new Response(null, { status: 404 });
  if ((recent?.n ?? 0) >= PER_MINUTE) return new Response(null, { status: 429 });

  await db.insert(clipboardEvent).values({
    userId: cu.user.id,
    conversationId: event.conversationId,
    kind: event.kind,
    surface: event.surface,
    turn: event.turn ?? null,
    role: event.role ?? null,
    charCount: event.charCount,
    content: event.content,
  });
  return new Response(null, { status: 204 });
}
