import { and, asc, desc, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  conversation,
  message,
  review,
  reviewClaim,
  submission,
} from "@/db/schema";
import { deriveTitle } from "@/lib/conversations";
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
 * reviewer's own, the reviewer has not already reviewed it and is not
 * already holding it, and fewer people than the limit are holding or have
 * reviewed it. The limit is event_settings.maxReviewsPerTranscript.
 *
 * Each claim takes a numbered place on its transcript, the lowest one free,
 * and the database allows each place to be held once. That is what stops
 * the limit being exceeded when two reviewers ask at the same instant: both
 * see the same place free, both ask for it, one insert is refused, and that
 * transcript is skipped for that reviewer rather than handed out too often.
 */
export async function claimBatch(reviewerId: string, size?: number) {
  const settings = await getEventSettings();
  const batchSize = size ?? settings.reviewBatchSize;
  const limit = settings.maxReviewsPerTranscript;

  // One statement, for two reasons.
  //
  // Correctness: selecting candidates and then inserting them one by one
  // leaves a gap in which another reviewer can take the same place. Doing
  // both together, with the unique indexes rejecting anything already
  // taken, closes it.
  //
  // Speed: claiming five transcripts in five round trips was the slowest
  // thing in the interface, and on a database a network hop away it was most
  // of the delay on first opening the review console.
  //
  // Candidates are drawn at random, preferring transcripts this reviewer has
  // not already passed over: refreshing a batch is how someone says "not
  // these", so returning the same five would make the button pointless.
  // Previously released ones are still offered once the untouched pool runs
  // dry, since a small event can exhaust it.
  const rows = await db.execute<{ conversation_id: string }>(sql`
    insert into ${reviewClaim} (conversation_id, reviewer_id, slot)
    select candidate.id, ${reviewerId}, candidate.free_slot
    from (
      select
        c.id,
        (
          select min(place)
          from generate_series(1, ${limit}::int) as place
          where not exists (
            select 1 from ${reviewClaim} taken
            where taken.conversation_id = c.id
              and taken.state <> 'released'
              and taken.slot = place
          )
        ) as free_slot,
        exists (
          select 1 from ${reviewClaim} passed
          where passed.conversation_id = c.id and passed.reviewer_id = ${reviewerId}
        ) as passed_over
      from ${conversation} c
      where c.status = 'submitted'
        and c.user_id <> ${reviewerId}
        -- Not one this reviewer has reviewed or is holding.
        and not exists (
          select 1 from ${review} r
          where r.conversation_id = c.id and r.reviewer_id = ${reviewerId}
        )
        and not exists (
          select 1 from ${reviewClaim} mine
          where mine.conversation_id = c.id
            and mine.reviewer_id = ${reviewerId}
            and mine.state <> 'released'
        )
        -- Counted separately from the free place: lowering the limit can
        -- leave a low place free on a transcript that is already full.
        and (
          select count(*) from ${reviewClaim} live
          where live.conversation_id = c.id and live.state <> 'released'
        ) < ${limit}::int
    ) candidate
    where candidate.free_slot is not null
    order by candidate.passed_over asc, random()
    limit ${batchSize}
    on conflict do nothing
    returning conversation_id
  `);

  return (rows as unknown as { conversation_id: string }[]).map(
    (r) => r.conversation_id,
  );
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

/**
 * What a reviewer sees a transcript listed as: the start of its first
 * message, which they are about to read anyway.
 *
 * Not the conversation's title. Authors can rename their conversations, so a
 * title can say who wrote it or what they were attempting, and showing that
 * in the review list would tell the reviewer exactly what a blind review
 * exists to keep from them.
 */
const firstUserMessage = sql<string | null>`(
  select m.content from ${message} m
  where m.conversation_id = ${conversation.id}
    and m.role = 'user' and m.superseded_by is null
  order by m.seq limit 1
)`;

function listingTitle(firstMessage: string | null) {
  return firstMessage?.trim() ? deriveTitle(firstMessage) : "Transcript";
}

/** The transcripts this reviewer is holding and has not yet reviewed. */
export async function listClaimed(reviewerId: string) {
  const rows = await db
    .select({
      conversationId: reviewClaim.conversationId,
      claimedAt: reviewClaim.claimedAt,
      firstMessage: firstUserMessage,
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
  return rows.map(({ firstMessage, ...row }) => ({
    ...row,
    title: listingTitle(firstMessage),
  }));
}

/** This reviewer's completed reviews, most recently submitted first. */
export async function listCompleted(reviewerId: string) {
  const rows = await db
    .select({
      conversationId: review.conversationId,
      updatedAt: review.updatedAt,
      submissionCount: review.submissionCount,
      firstMessage: firstUserMessage,
      modelId: conversation.modelId,
    })
    .from(review)
    .innerJoin(conversation, eq(conversation.id, review.conversationId))
    .where(eq(review.reviewerId, reviewerId))
    .orderBy(desc(review.updatedAt));
  return rows.map(({ firstMessage, ...row }) => ({
    ...row,
    title: listingTitle(firstMessage),
  }));
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

  // Show the submitted version, not the conversation as it is now.
  //
  // The author can keep chatting after submitting, right up until a review
  // lands and locks the transcript. Reading the live messages meant a
  // reviewer could be shown turns that were never submitted, and the review
  // was then recorded against whatever version existed when they pressed
  // submit rather than the one they had read. A submission is an immutable
  // snapshot, so reading that is what makes "version N was reviewed" true.
  const [mine] = await db
    .select({ reviewedVersion: review.reviewedVersion })
    .from(review)
    .where(
      and(
        eq(review.conversationId, conversationId),
        eq(review.reviewerId, reviewerId),
      ),
    );
  const version = mine?.reviewedVersion ?? convo.currentVersion;

  const [submitted] = await db
    .select({ snapshot: submission.snapshot })
    .from(submission)
    .where(
      and(
        eq(submission.conversationId, conversationId),
        eq(submission.version, version),
      ),
    );
  if (!submitted) return null;

  const snapshot = submitted.snapshot as {
    modelId?: string;
    scenario?: string | null;
    messages?: { seq: number; role: "user" | "assistant"; content: string }[];
  };

  return {
    conversationId,
    modelId: snapshot.modelId ?? convo.modelId,
    scenario: snapshot.scenario ?? null,
    submittedVersion: version,
    turns: (snapshot.messages ?? []).map((m) => ({
      seq: m.seq,
      role: m.role,
      content: m.content,
    })),
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
