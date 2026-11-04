import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { usageEvent } from "@/db/schema";

/** Tokens a user has spent in the last 24 hours. */
export async function tokensUsedToday(userId: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [row] = await db
    .select({
      total: sql<number>`coalesce(sum(${usageEvent.promptTokens} + ${usageEvent.completionTokens}), 0)::int`,
    })
    .from(usageEvent)
    .where(and(eq(usageEvent.userId, userId), gte(usageEvent.createdAt, since)));
  return row?.total ?? 0;
}

/**
 * Claims a slot under the per-user rate limit, atomically.
 *
 * Checking a count and then recording the request is a race: simultaneous
 * requests all read the same count before any has recorded itself, so all of
 * them pass. Both steps therefore run inside one transaction holding an
 * advisory lock keyed on the user, which makes the check-then-record pair
 * indivisible for that user while leaving other users unaffected.
 *
 * The row is written when the request starts, with zero tokens, so the limit
 * sees in-flight work. Token counts are filled in when the reply finishes.
 *
 * Returns the usage-event id to fill in later, or null when over the limit.
 */
export async function reserveSlot(opts: {
  userId: string;
  conversationId?: string;
  kind: "chat" | "judge";
  modelId: string;
  limit: number;
  windowSeconds: number;
}): Promise<string | null> {
  const since = new Date(Date.now() - opts.windowSeconds * 1000);

  return db.transaction(async (tx) => {
    // Serialize reservations for this one user. Without it a request can
    // count the window before an earlier request's row has committed, see a
    // low number and wrongly pass. Different users hash to different locks,
    // so they never wait on each other.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${opts.userId + ":" + opts.kind}))`,
    );

    const [row] = await tx
      .select({ used: sql<number>`count(*)::int` })
      .from(usageEvent)
      .where(
        and(
          eq(usageEvent.userId, opts.userId),
          eq(usageEvent.kind, opts.kind),
          gte(usageEvent.createdAt, since),
        ),
      );
    if ((row?.used ?? 0) >= opts.limit) return null;

    const [mine] = await tx
      .insert(usageEvent)
      .values({
        userId: opts.userId,
        conversationId: opts.conversationId,
        kind: opts.kind,
        modelId: opts.modelId,
        promptTokens: 0,
        completionTokens: 0,
      })
      .returning({ id: usageEvent.id });
    return mine.id;
  });
}

/** Fills in the real token counts once a reply has finished. */
export async function finishUsageEvent(
  id: string,
  data: {
    messageId?: string;
    promptTokens: number;
    completionTokens: number;
    costUsd?: number | null;
  },
) {
  await db
    .update(usageEvent)
    .set({
      messageId: data.messageId,
      promptTokens: data.promptTokens,
      completionTokens: data.completionTokens,
      costUsd: data.costUsd ?? null,
    })
    .where(eq(usageEvent.id, id));
}

/** Judge runs a user has made in the last hour. */
export async function judgeRunsLastHour(userId: string): Promise<number> {
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(usageEvent)
    .where(
      and(
        eq(usageEvent.userId, userId),
        eq(usageEvent.kind, "judge"),
        gte(usageEvent.createdAt, since),
      ),
    );
  return row?.count ?? 0;
}
