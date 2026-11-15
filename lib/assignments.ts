import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  conversation,
  episode,
  pairAudit,
  reviewRevision,
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
  // shown part of, for any purpose (reviewed, compared, skipped or in
  // progress), and any that contains work of their own. One that only
  // ran out of time, with nothing recorded, can come back to them.
  const offLimits = sql`(
    select a.family_id from ${reviewAssignment} a
    where a.reviewer_id = ${reviewerId} and a.state <> 'expired'
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
            -- A view exists only for what has been submitted: a whole
            -- conversation or folder, or one session of a folder that is
            -- itself still open. Either may be reviewed.
            where e.assignment_state = 'ready'
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
          join ${conversation} sc on sc.id = rv.source_conversation_id
          join ${conversation} tc on tc.id = rv.target_conversation_id
          -- A pair is two single conversations. It is complete once both
          -- have been submitted, whatever has become of any folder either
          -- sits in, and auditable once both may be shown.
          where sc.status = 'submitted' and tc.status = 'submitted'
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
    const [answered] =
      assignment.state === "completed"
        ? await db.select().from(reviewResponse).where(eq(reviewResponse.assignmentId, assignmentId))
        : [];
    return {
      assignment,
      kind: "primary" as const,
      // What was answered, when this is a review being looked at again.
      answered: answered ?? null,
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
    // Each side is one conversation: the session the related version was
    // made from, and the conversation that was started. Not the folder
    // either may be in.
    const side = async (conversationId: string | null) => {
      if (!conversationId) return null;
      const [view] = await db
        .select({ content: reviewView.content })
        .from(reviewView)
        .where(and(eq(reviewView.conversationId, conversationId), eq(reviewView.kind, "session")));
      return (view?.content as ViewContent | undefined) ?? null;
    };
    const [source, target] = await Promise.all([
      side(link.sourceConversationId),
      side(link.targetConversationId),
    ]);
    const [answered] =
      assignment.state === "completed"
        ? await db.select().from(pairAudit).where(eq(pairAudit.assignmentId, assignmentId))
        : [];
    return {
      assignment,
      kind: "pair_audit" as const,
      answered: answered ?? null,
      anchorConversationId: link.sourceConversationId ?? (await firstSession(link.sourceEpisodeId)),
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
  // Everything this reviewer has in progress, not only the one on screen.
  // A transcript review and a comparison can both be open, and the one
  // set aside must not run out of time while its reviewer is busy with
  // the other: it would be lost to them for good, with what they had
  // filled in. It is still let go once they stop reviewing altogether.
  await db
    .update(reviewAssignment)
    .set({ lastSeenAt: new Date() })
    .where(
      and(
        eq(reviewAssignment.reviewerId, reviewerId),
        eq(reviewAssignment.state, "active"),
        sql`exists (
          select 1 from review_assignment shown
          where shown.id = ${assignmentId} and shown.reviewer_id = ${reviewerId}
            and shown.state = 'active'
        )`,
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

/**
 * Form C. The first time, the reviewer's answer. After that, a change to
 * it: the answers are replaced and the version they replace is kept, so
 * the first, independent answer is never lost.
 */
export async function submitReview(
  assignmentId: string,
  reviewerId: string,
  answers: ReviewAnswers,
) {
  const policy = await getPolicy();

  return db.transaction(async (tx) => {
    const { assignment, done } = await claimForFinishing(tx, assignmentId, reviewerId, "primary");

    const [view] = await tx
      .select({ id: reviewView.id, content: reviewView.content, state: episode.assignmentState })
      .from(reviewView)
      .innerJoin(episode, eq(episode.id, reviewView.episodeId))
      .where(eq(reviewView.id, assignment.viewId!));
    if (!view) throw new AssignmentError("This record no longer exists.");
    // Held or withdrawn while it was being read: nothing goes into the
    // panel for it.
    if (!done && view.state !== "ready") {
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
    const given = {
      verdict: answers.verdict,
      confidence: answers.confidence,
      evidenceMode: answers.evidenceMode,
      evidenceTurns,
      rationale: answers.rationale,
      subjectSensitivity: answers.subjectSensitivity,
      aimEvidence: answers.aimEvidence,
    };

    if (done) {
      const [before] = await tx
        .select()
        .from(reviewResponse)
        .where(eq(reviewResponse.assignmentId, assignmentId));
      if (!before) throw new AssignmentError("That review could not be found.");
      const same = (Object.keys(given) as (keyof typeof given)[]).every(
        (k) => JSON.stringify(before[k]) === JSON.stringify(given[k]),
      );
      if (same) return { already: true as const, revised: false as const };
      const now = new Date();
      await tx.insert(reviewRevision).values({
        assignmentId,
        reviewerId,
        purpose: "primary",
        version: before.revisionCount + 1,
        previous: before,
        replacedAt: now,
      });
      await tx
        .update(reviewResponse)
        .set({
          ...given,
          // A change is made under the instructions and form in force now.
          policyVersion: policy.version,
          formVersion: REVIEW_FORM_VERSION,
          revisedAt: now,
          revisionCount: before.revisionCount + 1,
        })
        .where(eq(reviewResponse.id, before.id));
      return { already: false as const, revised: true as const };
    }

    await tx.insert(reviewResponse).values({
      assignmentId,
      viewId: view.id,
      reviewerId,
      ...given,
      // Not asked by this form; see BASIS_NOT_ASKED.
      policyBasis: BASIS_NOT_ASKED,
      uncertaintyReasons: [],
      uncertaintyOther: null,
      policyVersion: policy.version,
      formVersion: REVIEW_FORM_VERSION,
    });
    await tx
      .update(reviewAssignment)
      .set({ state: "completed", finishedAt: new Date() })
      .where(eq(reviewAssignment.id, assignmentId));
    return { already: false as const, revised: false as const };
  });
}

/** Form D. As with a review: the first answer, or a change to it. */
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
    const given = {
      topicTaskMatch: answers.topicTaskMatch,
      scopeSimilarity: answers.scopeSimilarity,
      mainDifference: answers.mainDifference,
      auditNote: answers.auditNote || null,
    };

    if (done) {
      const [before] = await tx
        .select()
        .from(pairAudit)
        .where(eq(pairAudit.assignmentId, assignmentId));
      if (!before) throw new AssignmentError("That comparison could not be found.");
      const same = (Object.keys(given) as (keyof typeof given)[]).every(
        (k) => before[k] === given[k],
      );
      if (same) return { already: true as const, revised: false as const };
      const now = new Date();
      await tx.insert(reviewRevision).values({
        assignmentId,
        reviewerId,
        purpose: "pair_audit",
        version: before.revisionCount + 1,
        previous: before,
        replacedAt: now,
      });
      await tx
        .update(pairAudit)
        .set({
          ...given,
          formVersion: AUDIT_FORM_VERSION,
          revisedAt: now,
          revisionCount: before.revisionCount + 1,
        })
        .where(eq(pairAudit.id, before.id));
      return { already: false as const, revised: true as const };
    }

    await tx.insert(pairAudit).values({
      assignmentId,
      relatedVersionId: assignment.relatedVersionId!,
      reviewerId,
      ...given,
      formVersion: AUDIT_FORM_VERSION,
    });
    await tx
      .update(reviewAssignment)
      .set({ state: "completed", finishedAt: new Date() })
      .where(eq(reviewAssignment.id, assignmentId));
    return { already: false as const, revised: false as const };
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

/**
 * Everything a reviewer has in hand or has finished, for the list beside
 * the review pages: what is in progress first, then what they completed,
 * newest first. Skipped and timed-out items are not listed: there is
 * nothing in them to go back to.
 */
export async function reviewerWork(reviewerId: string) {
  const rows = await db
    .select({
      id: reviewAssignment.id,
      purpose: reviewAssignment.purpose,
      state: reviewAssignment.state,
      reservedAt: reviewAssignment.reservedAt,
      finishedAt: reviewAssignment.finishedAt,
      verdict: reviewResponse.verdict,
      mainDifference: pairAudit.mainDifference,
      revisions: sql<number>`coalesce(${reviewResponse.revisionCount}, ${pairAudit.revisionCount}, 0)::int`,
    })
    .from(reviewAssignment)
    .leftJoin(reviewResponse, eq(reviewResponse.assignmentId, reviewAssignment.id))
    .leftJoin(pairAudit, eq(pairAudit.assignmentId, reviewAssignment.id))
    .where(
      and(
        eq(reviewAssignment.reviewerId, reviewerId),
        inArray(reviewAssignment.state, ["active", "completed"]),
      ),
    )
    .orderBy(desc(sql`coalesce(${reviewAssignment.finishedAt}, ${reviewAssignment.reservedAt})`));
  return {
    inProgress: rows.filter((r) => r.state === "active"),
    completed: rows.filter((r) => r.state === "completed"),
  };
}

/**
 * Why a reviewer was given nothing, in numbers, so that "nothing right
 * now" does not have to be taken on trust. Each record is counted once,
 * under the first reason that applies to it.
 */
export async function whyNothing(reviewerId: string, purpose: Purpose) {
  const settings = await getEventSettings();
  const mine = sql`(select m.source_family_id from ${episode} m where m.user_id = ${reviewerId})`;
  const shown = sql`(
    select a.family_id from ${reviewAssignment} a
    where a.reviewer_id = ${reviewerId} and a.state <> 'expired')`;
  type Counts = { total: number; own: number; shown: number; held: number; taken: number };
  const [counts] = (await (purpose === "primary"
    ? db.execute<Counts>(sql`
        select
          count(*)::int as total,
          count(*) filter (where own)::int as own,
          count(*) filter (where not own and shown)::int as shown,
          count(*) filter (where not own and not shown and not ready)::int as held,
          count(*) filter (where not own and not shown and ready and taken)::int as taken
        from (
          select
            v.family_id in ${mine} as own,
            v.family_id in ${shown} as shown,
            e.assignment_state = 'ready' as ready,
            (select count(*) from ${reviewAssignment} h
              where h.view_id = v.id and h.purpose = 'primary'
                and h.state in ('active', 'completed')) >= ${settings.reviewsPerView}::int as taken
          from ${reviewView} v join ${episode} e on e.id = v.episode_id
        ) t
      `)
    : db.execute<Counts>(sql`
        select
          count(*)::int as total,
          count(*) filter (where own)::int as own,
          count(*) filter (where not own and shown)::int as shown,
          count(*) filter (where not own and not shown and not ready)::int as held,
          count(*) filter (where not own and not shown and ready and taken)::int as taken
        from (
          select
            rv.family_id in ${mine} as own,
            rv.family_id in ${shown} as shown,
            (source.assignment_state = 'ready' and target.assignment_state = 'ready') as ready,
            exists (select 1 from ${reviewAssignment} h
              where h.related_version_id = rv.id and h.purpose = 'pair_audit'
                and h.state in ('active', 'completed')) as taken
          from ${relatedVersion} rv
          join ${episode} source on source.id = rv.source_episode_id
          join ${episode} target on target.id = rv.target_episode_id
          join ${conversation} sc on sc.id = rv.source_conversation_id
          join ${conversation} tc on tc.id = rv.target_conversation_id
          where sc.status = 'submitted' and tc.status = 'submitted'
        ) t
      `))) as unknown as Counts[];
  return counts ?? { total: 0, own: 0, shown: 0, held: 0, taken: 0 };
}

/** "Nothing for you right now", with what stands in the way of each record. */
export function nothingMessage(
  purpose: Purpose,
  c: { total: number; own: number; shown: number; held: number; taken: number },
) {
  const what = purpose === "primary" ? "record" : "pair";
  const n = (count: number) => `${count} ${what}${count === 1 ? "" : "s"}`;
  const lead =
    purpose === "primary"
      ? "There is nothing for you to review right now."
      : "There is no pair for you to compare right now.";
  if (c.total === 0) {
    return `${lead} ${purpose === "primary" ? "Nothing has been submitted yet." : "No related conversation has been submitted alongside its original yet."} Try again in a little while.`;
  }
  const reasons = [
    c.own > 0 && `${n(c.own)} ${c.own === 1 ? "is" : "are"} your own work`,
    c.shown > 0 &&
      `${n(c.shown)} ${c.shown === 1 ? "belongs" : "belong"} to work you have already been shown (reviewed, compared, skipped or in progress): each piece of work is shown to you once, in one way`,
    c.taken > 0 &&
      (purpose === "primary"
        ? `${n(c.taken)} already ${c.taken === 1 ? "has" : "have"} all the reviews ${c.taken === 1 ? "it needs" : "they need"}`
        : `${n(c.taken)} ${c.taken === 1 ? "has" : "have"} already been compared or ${c.taken === 1 ? "is" : "are"} being compared`),
    c.held > 0 && `${n(c.held)} ${c.held === 1 ? "is" : "are"} held back by an organizer`,
  ].filter(Boolean);
  return `${lead} ${n(c.total)} ${c.total === 1 ? "has" : "have"} been submitted${reasons.length ? `: ${reasons.join("; ")}` : ""}. More become available as people submit.`;
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
