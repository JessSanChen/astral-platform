"use server";

import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { conversation, review, reviewClaim } from "@/db/schema";
import { requireOnboarded } from "@/lib/gate";
import { claimBatch, releaseBatch } from "@/lib/reviews";
import { reviewSchema } from "@/lib/review-schema";

export type ReviewState = {
  errors?: Record<string, string>;
  message?: string;
  submissionCount?: number;
};

type Intent = "benign" | "dual_use" | "adversarial" | "unclear";
type Actor = typeof review.$inferInsert.actor;

export async function submitReview(
  _prev: ReviewState,
  formData: FormData,
): Promise<ReviewState> {
  const { user } = await requireOnboarded();
  const conversationId = String(formData.get("conversationId"));

  // Only a transcript this reviewer is actually holding can be reviewed.
  //
  // Released rows must be excluded here, not filtered afterwards. Refreshing
  // a batch leaves an old released row beside the new live one for the same
  // transcript, and a query that asks for "a claim" gets whichever the
  // database happens to return: often the stale one, which made every
  // transcript in a refreshed batch refuse to accept a review.
  const [claim] = await db
    .select()
    .from(reviewClaim)
    .where(
      and(
        eq(reviewClaim.conversationId, conversationId),
        eq(reviewClaim.reviewerId, user.id),
        ne(reviewClaim.state, "released"),
      ),
    );
  if (!claim) {
    return { message: "This transcript is no longer assigned to you." };
  }

  const parsed = reviewSchema.safeParse({
    intent: formData.get("intent"),
    misusePresent: formData.get("misusePresent"),
    actor: formData.get("actor"),
    goalText: formData.get("goalText"),
    confidence: formData.get("confidence"),
    notes: formData.get("notes") ?? undefined,
  });
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!errors[key]) errors[key] = issue.message;
    }
    return { errors, message: "Please complete the highlighted fields." };
  }

  const v = parsed.data;
  const now = new Date();

  const [convo] = await db
    .select({ currentVersion: conversation.currentVersion })
    .from(conversation)
    .where(eq(conversation.id, conversationId));

  const saved = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(review)
      .values({
        conversationId,
        reviewerId: user.id,
        reviewedVersion: convo?.currentVersion ?? null,
        intent: v.intent as Intent,
        misusePresent: v.misusePresent,
        actor: v.actor as Actor,
        goalText: v.goalText,
        confidence: v.confidence,
        notes: v.notes || null,
        submittedAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: review.conversationId,
        set: {
          intent: v.intent as Intent,
          misusePresent: v.misusePresent,
          actor: v.actor as Actor,
          goalText: v.goalText,
          confidence: v.confidence,
          notes: v.notes || null,
          updatedAt: now,
          // Counts re-submissions, which the quality audit uses.
          submissionCount: sql`${review.submissionCount} + 1`,
        },
      })
      .returning({ submissionCount: review.submissionCount });

    await tx
      .update(reviewClaim)
      .set({ state: "reviewed" })
      .where(eq(reviewClaim.id, claim.id));

    // Lock the author out of further changes. A review describes a transcript
    // as it stood when it was read, so letting the author keep editing would
    // quietly invalidate the label. Nothing polls for this: the author's own
    // submit checks the lock at the moment they act.
    await tx
      .update(conversation)
      .set({ lockedAt: now })
      .where(eq(conversation.id, conversationId));

    return row;
  });

  return { submissionCount: saved?.submissionCount ?? 1 };
}

export async function refreshBatch() {
  const { user } = await requireOnboarded();
  await releaseBatch(user.id);
  await claimBatch(user.id);
}

export async function fillBatch() {
  const { user } = await requireOnboarded();
  await claimBatch(user.id);
}
