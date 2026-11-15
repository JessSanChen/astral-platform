import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  conversation,
  episode,
  pairAudit,
  profile,
  relatedVersion,
  reviewAssignment,
  reviewResponse,
  reviewView,
  user,
} from "@/db/schema";
import type { ViewContent } from "@/lib/episodes";
import type { IntakeDraft } from "@/lib/intake";
import { getEventSettings } from "@/lib/openrouter";
import { getPolicy } from "@/lib/policy";
import {
  AUDIT_FORM_VERSION,
  BASIS_NOT_ASKED,
  REVIEW_FORM_VERSION,
  type AuditAnswers,
  type ReviewAnswers,
} from "@/lib/review-form";

/**
 * Who reviews what (specification section 5, simplified at the
 * organizer's request).
 *
 * A reviewer has one thing in front of them at a time, chosen for them. It
 * is never their own work, and never something from a family they have
 * already been shown any part of. Beyond that, every available record is
 * open to every reviewer: nobody is matched on subject knowledge, and a
 * reviewer who finds a record outside their expertise skips it. Nothing
 * loosens the two rules when the pool runs dry: the answer then is that
 * there is nothing to do.
 *
 * An assignment row is also the record that someone was shown something,
 * which is why skipped and expired ones are kept.
 */

export class AssignmentError extends Error {}

export type Purpose = "primary" | "pair_audit";

/** What someone said they could assess, as it stood when they were asked. */
function familiarity(intake: unknown) {
  return { rated: ((intake ?? {}) as Partial<IntakeDraft>).familiarity ?? {} };
}

/** Lets go of items nobody has touched for longer than a reservation lasts. */
async function expireStale() {
  const { reviewReservationMinutes } = await getEventSettings();
  await db.execute(sql`
    update ${reviewAssignment}
    set state = 'expired', finished_at = now()
    where state = 'active'
      and last_seen_at < now() - make_interval(mins => ${reviewReservationMinutes})
  `);
}

/**
 * What a reviewer has in progress: at most one transcript review and one
 * comparison. The two are different kinds of review, so having one open
 * does not stop someone starting the other.
 */
export async function getActiveAssignments(reviewerId: string) {
  const rows = await db
    .select()
    .from(reviewAssignment)
    .where(and(eq(reviewAssignment.reviewerId, reviewerId), eq(reviewAssignment.state, "active")));
  return {
    primary: rows.find((r) => r.purpose === "primary") ?? null,
    pair_audit: rows.find((r) => r.purpose === "pair_audit") ?? null,
  };
}

/** What a reviewer needs before being given anything. */
async function reviewerStanding(reviewerId: string) {
  const [[account], [details], policy] = await Promise.all([
    db
      .select({ policyReadyVersion: user.policyReadyVersion })
      .from(user)
      .where(eq(user.id, reviewerId)),
    db.select({ intake: profile.intake }).from(profile).where(eq(profile.userId, reviewerId)),
    getPolicy(),
  ]);
  return {
    policy,
    policyReady: account?.policyReadyVersion === policy.version,
    intake: details?.intake ?? null,
  };
}

/**
 * Gives a reviewer their next item of one kind, or the one of that kind
 * they already have.
 *
 * Returns null when there is nothing they are eligible for.
 */
export async function requestAssignment(reviewerId: string, purpose: Purpose) {
  const existing = (await getActiveAssignments(reviewerId))[purpose];
  if (existing) return existing;

  const standing = await reviewerStanding(reviewerId);
  if (!standing.policyReady) {
    throw new AssignmentError("Complete the review instruction first.");
  }
  await expireStale();

  const settings = await getEventSettings();
  // Kept with the assignment as a description of the reviewer at the time.
  // It no longer decides anything: every released record is open to all.
  const { rated } = familiarity(standing.intake);
  const routing = { familiarity: rated, policyVersion: standing.policy.version };

  // Families this person must not be shown: any they have already been
  // shown part of, for any purpose and however it ended, and any that
  // contains work of their own.
  const offLimits = sql`(
    select a.family_id from ${reviewAssignment} a where a.reviewer_id = ${reviewerId}
    union
    select mine.source_family_id from ${episode} mine where mine.user_id = ${reviewerId}
  )`;

  // One statement each, so that choosing and reserving cannot be separated
  // by someone else choosing the same thing. The unique indexes do the
  // refusing: one active item of a kind per person, one look at a family per person,
  // one holder per place on a view.
  const rows =
    purpose === "primary"
      ? await db.execute<{ id: string }>(sql`
          insert into ${reviewAssignment}
            (reviewer_id, purpose, view_id, family_id, slot, routing)
          select ${reviewerId}, 'primary', candidate.id, candidate.family_id,
                 candidate.free_slot, ${JSON.stringify(routing)}::jsonb
          from (
            select
              v.id, v.family_id,
              (
                select min(place)
                from generate_series(1, ${settings.reviewsPerView}::int) as place
                where not exists (
                  select 1 from ${reviewAssignment} taken
                  where taken.view_id = v.id and taken.purpose = 'primary'
                    and taken.state in ('active', 'completed') and taken.slot = place
                )
              ) as free_slot,
              (
                select count(*) from ${reviewAssignment} done
                where done.view_id = v.id and done.purpose = 'primary' and done.state = 'completed'
              ) as completed
            from ${reviewView} v
            join ${episode} e on e.id = v.episode_id
            where e.status = 'submitted'
              and e.assignment_state = 'ready'
              and v.family_id not in ${offLimits}
              and (
                select count(*) from ${reviewAssignment} held
                where held.view_id = v.id and held.purpose = 'primary'
                  and held.state in ('active', 'completed')
              ) < ${settings.reviewsPerView}::int
          ) candidate
          where candidate.free_slot is not null
          -- Least-reviewed first, so coverage spreads; chance decides ties.
          order by candidate.completed asc, random()
          limit 1
          on conflict do nothing
          returning id
        `)
      : await db.execute<{ id: string }>(sql`
          insert into ${reviewAssignment}
            (reviewer_id, purpose, related_version_id, family_id, routing)
          select ${reviewerId}, 'pair_audit', rv.id, rv.family_id, ${JSON.stringify(routing)}::jsonb
          from ${relatedVersion} rv
          join ${episode} source on source.id = rv.source_episode_id
          join ${episode} target on target.id = rv.target_episode_id
          -- A pair is complete once both ends are submitted, and auditable
          -- once both may be shown. The auditor has to be able to judge both.
          where source.status = 'submitted' and target.status = 'submitted'
            and source.assignment_state = 'ready' and target.assignment_state = 'ready'
            and rv.family_id not in ${offLimits}
            and not exists (
              select 1 from ${reviewAssignment} audited
              where audited.related_version_id = rv.id and audited.purpose = 'pair_audit'
                and audited.state in ('active', 'completed')
            )
          order by random()
          limit 1
          on conflict do nothing
          returning id
        `);

  const [created] = rows as unknown as { id: string }[];
  if (!created) return null;
  const [assignment] = await db
    .select()
    .from(reviewAssignment)
    .where(eq(reviewAssignment.id, created.id));
  return assignment ?? null;
}

/**
 * The first session of an episode. Copying and pasting on a review page is
 * recorded against it, since a view of several sessions has no single
 * conversation of its own.
 */
async function firstSession(episodeId: string) {
  const [row] = await db
    .select({ id: conversation.id })
    .from(conversation)
    .where(eq(conversation.episodeId, episodeId))
    .orderBy(conversation.sessionOrder)
    .limit(1);
  return row?.id ?? null;
}

/** An assignment of this reviewer's, with what it shows. Null if not theirs. */
export async function loadAssignment(assignmentId: string, reviewerId: string) {
  const [assignment] = await db
    .select()
    .from(reviewAssignment)
    .where(and(eq(reviewAssignment.id, assignmentId), eq(reviewAssignment.reviewerId, reviewerId)));
  if (!assignment) return null;

  if (assignment.purpose === "primary" && assignment.viewId) {
    const [view] = await db
      .select({
        id: reviewView.id,
        kind: reviewView.kind,
        content: reviewView.content,
        episodeId: reviewView.episodeId,
        conversationId: reviewView.conversationId,
        assignmentState: episode.assignmentState,
      })
      .from(reviewView)
      .innerJoin(episode, eq(episode.id, reviewView.episodeId))
      .where(eq(reviewView.id, assignment.viewId));
    if (!view) return null;
    return {
      assignment,
      kind: "primary" as const,
      anchorConversationId: view.conversationId ?? (await firstSession(view.episodeId)),
      view: {
        id: view.id,
        kind: view.kind,
        assignmentState: view.assignmentState,
        content: view.content as ViewContent,
      },
    };
  }

  if (assignment.purpose === "pair_audit" && assignment.relatedVersionId) {
    const [link] = await db
      .select()
      .from(relatedVersion)
      .where(eq(relatedVersion.id, assignment.relatedVersionId));
    if (!link) return null;
    // Each side as its fullest view: all sessions together where there are
    // several, the single session otherwise.
    const side = async (episodeId: string) => {
      const views = await db
        .select({ kind: reviewView.kind, content: reviewView.content })
        .from(reviewView)
        .where(eq(reviewView.episodeId, episodeId));
      const chosen = views.find((v) => v.kind === "linked") ?? views[0];
      return (chosen?.content as ViewContent | undefined) ?? null;
    };
    const [source, target] = await Promise.all([
      side(link.sourceEpisodeId),
      side(link.targetEpisodeId),
    ]);
    return {
      assignment,
      kind: "pair_audit" as const,
      anchorConversationId: await firstSession(link.sourceEpisodeId),
      pair: {
        // Only what the author said they would change. Not their goal note,
        // not which they thought of as the worrying one.
        intendedDifference: link.intendedDifference,
        comparisonIntent: link.comparisonIntent,
        source,
        target,
      },
    };
  }
  return null;
}

/** Records that the reviewer is still there, so their place is kept. */
export async function touchAssignment(assignmentId: string, reviewerId: string) {
  await db
    .update(reviewAssignment)
    .set({ lastSeenAt: new Date() })
    .where(
      and(
        eq(reviewAssignment.id, assignmentId),
        eq(reviewAssignment.reviewerId, reviewerId),
        eq(reviewAssignment.state, "active"),
      ),
    );
}

/**
 * Takes the assignment's row for the length of a transaction and checks it
 * is still this reviewer's to finish.
 */
async function claimForFinishing(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  assignmentId: string,
  reviewerId: string,
  purpose: Purpose,
) {
  const [assignment] = await tx
    .select()
    .from(reviewAssignment)
    .where(and(eq(reviewAssignment.id, assignmentId), eq(reviewAssignment.reviewerId, reviewerId)))
    .for("update");
  if (!assignment || assignment.purpose !== purpose) {
    throw new AssignmentError("This item is not assigned to you.");
  }
  if (assignment.state === "completed") return { assignment, done: true as const };
  if (assignment.state === "expired") {
    throw new AssignmentError(
      "Your reservation of this item ran out, and it may have gone to someone else. Nothing was recorded. Go back for another.",
    );
  }
  if (assignment.state !== "active") {
    throw new AssignmentError("This item is no longer open.");
  }
  return { assignment, done: false as const };
}

/** Form C: the one final answer. A second click changes nothing. */
export async function submitReview(
  assignmentId: string,
  reviewerId: string,
  answers: ReviewAnswers,
) {
  const policy = await getPolicy();

  return db.transaction(async (tx) => {
    const { assignment, done } = await claimForFinishing(tx, assignmentId, reviewerId, "primary");
    if (done) return { already: true as const };

    const [view] = await tx
      .select({ id: reviewView.id, content: reviewView.content, state: episode.assignmentState })
      .from(reviewView)
      .innerJoin(episode, eq(episode.id, reviewView.episodeId))
      .where(eq(reviewView.id, assignment.viewId!));
    if (!view) throw new AssignmentError("This record no longer exists.");
    // Held or withdrawn while it was being read: nothing goes into the
    // panel for it.
    if (view.state !== "ready") {
      throw new AssignmentError(
        "An organizer has put this record on hold, so a review of it cannot be accepted. Nothing was recorded. Go back for another item.",
      );
    }
    // Evidence is the user's messages. A number that is the assistant's,
    // or is not in the record at all, is not accepted as one.
    const userTurns = new Set(
      (view.content as ViewContent).turns.filter((t) => t.role === "user").map((t) => t.n),
    );
    const evidenceTurns = answers.evidenceTurns.filter((n) => userTurns.has(n));
    if (answers.evidenceMode === "turns" && evidenceTurns.length === 0) {
      throw new AssignmentError("Point to at least one of the user's messages in the record.");
    }

    await tx.insert(reviewResponse).values({
      assignmentId,
      viewId: view.id,
      reviewerId,
      verdict: answers.verdict,
      // Not asked by this form; see BASIS_NOT_ASKED.
      policyBasis: BASIS_NOT_ASKED,
      confidence: answers.confidence,
      evidenceMode: answers.evidenceMode,
      evidenceTurns,
      rationale: answers.rationale,
      // Not asked by this form.
      uncertaintyReasons: [],
      uncertaintyOther: null,
      subjectSensitivity: answers.subjectSensitivity,
      aimEvidence: answers.aimEvidence,
      policyVersion: policy.version,
      formVersion: REVIEW_FORM_VERSION,
    });
    await tx
      .update(reviewAssignment)
      .set({ state: "completed", finishedAt: new Date() })
      .where(eq(reviewAssignment.id, assignmentId));
    return { already: false as const };
  });
}

/** Form D. */
export async function submitAudit(
  assignmentId: string,
  reviewerId: string,
  answers: AuditAnswers,
) {
  return db.transaction(async (tx) => {
    const { assignment, done } = await claimForFinishing(
      tx,
      assignmentId,
      reviewerId,
      "pair_audit",
    );
    if (done) return { already: true as const };
    await tx.insert(pairAudit).values({
      assignmentId,
      relatedVersionId: assignment.relatedVersionId!,
      reviewerId,
      topicTaskMatch: answers.topicTaskMatch,
      scopeSimilarity: answers.scopeSimilarity,
      mainDifference: answers.mainDifference,
      auditNote: answers.auditNote || null,
      formVersion: AUDIT_FORM_VERSION,
    });
    await tx
      .update(reviewAssignment)
      .set({ state: "completed", finishedAt: new Date() })
      .where(eq(reviewAssignment.id, assignmentId));
    return { already: false as const };
  });
}

/**
 * A skip: an outcome of the assignment, with a reason and no verdict. That
 * the reviewer was shown the item stays on record, so the rest of its
 * family is still closed to them.
 */
export async function skipAssignment(
  assignmentId: string,
  reviewerId: string,
  reason: string,
  note: string,
) {
  const [skipped] = await db
    .update(reviewAssignment)
    .set({ state: "skipped", skipReason: reason, skipNote: note || null, finishedAt: new Date() })
    .where(
      and(
        eq(reviewAssignment.id, assignmentId),
        eq(reviewAssignment.reviewerId, reviewerId),
        eq(reviewAssignment.state, "active"),
      ),
    )
    .returning({ id: reviewAssignment.id });
  if (!skipped) throw new AssignmentError("This item is no longer open.");
}

/** What one person has done as a reviewer, for their own page. */
export async function reviewerSummary(reviewerId: string) {
  const [[counts], standing, active] = await Promise.all([
    db
      .select({
        reviewed: sql<number>`count(*) filter (where ${reviewAssignment.state} = 'completed' and ${reviewAssignment.purpose} = 'primary')::int`,
        compared: sql<number>`count(*) filter (where ${reviewAssignment.state} = 'completed' and ${reviewAssignment.purpose} = 'pair_audit')::int`,
        skippedReviews: sql<number>`count(*) filter (where ${reviewAssignment.state} = 'skipped' and ${reviewAssignment.purpose} = 'primary')::int`,
        skippedComparisons: sql<number>`count(*) filter (where ${reviewAssignment.state} = 'skipped' and ${reviewAssignment.purpose} = 'pair_audit')::int`,
      })
      .from(reviewAssignment)
      .where(eq(reviewAssignment.reviewerId, reviewerId)),
    reviewerStanding(reviewerId),
    getActiveAssignments(reviewerId),
  ]);
  return {
    reviewed: counts?.reviewed ?? 0,
    compared: counts?.compared ?? 0,
    skippedReviews: counts?.skippedReviews ?? 0,
    skippedComparisons: counts?.skippedComparisons ?? 0,
    policy: standing.policy,
    policyReady: standing.policyReady,
    active,
  };
}

/** The last few things a reviewer finished, newest first. */
export async function recentAssignments(reviewerId: string, limit = 5) {
  return db
    .select({
      id: reviewAssignment.id,
      purpose: reviewAssignment.purpose,
      state: reviewAssignment.state,
      finishedAt: reviewAssignment.finishedAt,
    })
    .from(reviewAssignment)
    .where(and(eq(reviewAssignment.reviewerId, reviewerId), sql`${reviewAssignment.state} <> 'active'`))
    .orderBy(desc(reviewAssignment.finishedAt))
    .limit(limit);
}
