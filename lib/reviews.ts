import { and, asc, desc, eq, isNull, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { conversation, message, review, reviewClaim } from "@/db/schema";
import { getEventSettings } from "@/lib/openrouter";

export type ReviewableTranscript = {
  conversationId: string;
  modelId: string;
  scenario: string | null;
  submittedVersion: number;
  turns: { seq: number; role: "user" | "assistant"; content: string }[];
};

/**
 * Hands a reviewer a fresh batch.
 *
 * A transcript is eligible when its author has submitted it, it is not the
 * reviewer's own, nobody has reviewed it, and nobody else is holding it. The
 * claim rows are what stop two people labelling the same conversation: the
 * database has a unique index over live claims, so when two reviewers ask at
 * the same instant one of the inserts simply fails and that transcript is
 * skipped rather than handed out twice.
 */
export async function claimBatch(reviewerId: string, size?: number) {
  const settings = await getEventSettings();
  const batchSize = size ?? settings.reviewBatchSize;

  const candidates = await db
    .select({
      id: conversation.id,
      lastSubmittedAt: conversation.lastSubmittedAt,
    })
    .from(conversation)
    .leftJoin(review, eq(review.conversationId, conversation.id))
    .leftJoin(
      reviewClaim,
      and(
        eq(reviewClaim.conversationId, conversation.id),
        ne(reviewClaim.state, "released"),
      ),
    )
    .where(
      and(
        eq(conversation.status, "submitted"),
        ne(conversation.userId, reviewerId),
        isNull(review.id),
        isNull(reviewClaim.id),
      ),
    )
    .orderBy(asc(conversation.lastSubmittedAt))
    .limit(batchSize * 3);

  const claimed: string[] = [];
  for (const candidate of candidates) {
    if (claimed.length >= batchSize) break;
    try {
      await db
        .insert(reviewClaim)
        .values({ conversationId: candidate.id, reviewerId });
      claimed.push(candidate.id);
    } catch {
      // Someone else claimed it in the moment between the read and the
      // write. Nothing to repair; move on to the next candidate.
    }
  }
  return claimed;
}

/** Gives up any transcripts this reviewer holds but has not reviewed. */
export async function releaseBatch(reviewerId: string) {
  await db
    .update(reviewClaim)
    .set({ state: "released", releasedAt: new Date() })
    .where(
      and(
        eq(reviewClaim.reviewerId, reviewerId),
        eq(reviewClaim.state, "claimed"),
      ),
    );
}

/** The transcripts this reviewer is holding and has not yet reviewed. */
export async function listClaimed(reviewerId: string) {
  return db
    .select({
      conversationId: reviewClaim.conversationId,
      claimedAt: reviewClaim.claimedAt,
      title: conversation.title,
      modelId: conversation.modelId,
    })
    .from(reviewClaim)
    .innerJoin(conversation, eq(conversation.id, reviewClaim.conversationId))
    .where(
      and(
        eq(reviewClaim.reviewerId, reviewerId),
        eq(reviewClaim.state, "claimed"),
      ),
    )
    .orderBy(asc(reviewClaim.claimedAt));
}

/** This reviewer's completed reviews, most recently submitted first. */
export async function listCompleted(reviewerId: string) {
  return db
    .select({
      conversationId: review.conversationId,
      updatedAt: review.updatedAt,
      submissionCount: review.submissionCount,
      title: conversation.title,
      modelId: conversation.modelId,
    })
    .from(review)
    .innerJoin(conversation, eq(conversation.id, review.conversationId))
    .where(eq(review.reviewerId, reviewerId))
    .orderBy(desc(review.updatedAt));
}

/**
 * The transcript itself, as the reviewer should see it.
 *
 * Deliberately returns no author and none of the author's own labels: the
 * point of an independent review is a judgement of what is visible in the
 * conversation, not agreement with what its author said they were doing.
 */
export async function getTranscriptForReview(
  conversationId: string,
  reviewerId: string,
): Promise<ReviewableTranscript | null> {
  const [convo] = await db
    .select()
    .from(conversation)
    .where(eq(conversation.id, conversationId));
  if (!convo) return null;
  if (convo.userId === reviewerId) return null;

  // Readable only while held, or once reviewed by this same person.
  const [claim] = await db
    .select()
    .from(reviewClaim)
    .where(
      and(
        eq(reviewClaim.conversationId, conversationId),
        eq(reviewClaim.reviewerId, reviewerId),
        ne(reviewClaim.state, "released"),
      ),
    );
  if (!claim) return null;

  const rows = await db
    .select()
    .from(message)
    .where(eq(message.conversationId, conversationId))
    .orderBy(asc(message.seq));

  return {
    conversationId,
    modelId: convo.modelId,
    scenario: convo.scenario,
    submittedVersion: convo.currentVersion,
    turns: rows
      .filter((m) => !m.supersededBy)
      .map((m) => ({ seq: m.seq, role: m.role, content: m.content })),
  };
}

export async function getReview(conversationId: string, reviewerId: string) {
  const [row] = await db
    .select()
    .from(review)
    .where(
      and(
        eq(review.conversationId, conversationId),
        eq(review.reviewerId, reviewerId),
      ),
    );
  return row ?? null;
}

/** How many reviews each participant has completed, for the leaderboard. */
export async function reviewCounts() {
  return db
    .select({
      reviewerId: review.reviewerId,
      count: sql<number>`count(*)::int`,
    })
    .from(review)
    .groupBy(review.reviewerId);
}
