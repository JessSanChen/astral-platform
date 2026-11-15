import { outer } from "@/lib/sql";
import { and, asc, count, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  clipboardEvent,
  conversation,
  episode,
  episodeGoalRevision,
  message,
  nomination,
  pairAudit,
  profile,
  relatedVersion,
  reviewAssignment,
  reviewPolicy,
  reviewResponse,
  reviewView,
  usageEvent,
  user,
} from "@/db/schema";
import { sessionLetter } from "@/lib/episode-options";
import { DOMAINS, type IntakeDraft } from "@/lib/intake";
import { TRACK_VALUES } from "@/lib/nominations";
import { getEventSettings } from "@/lib/openrouter";
import { getPolicy } from "@/lib/policy";
import { panelOutcome } from "@/lib/review-form";

/**
 * What the organizer console reads. Everything here is in the terms of the
 * v1.1 specification: episodes (a conversation, or a folder of sessions),
 * the views reviewers are shown, and who was given what to judge.
 */

/** Headline numbers for the overview. */
export async function overview() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [policy, settings] = await Promise.all([getPolicy(), getEventSettings()]);

  const [people, episodes, sessions, views, assignments, audits, spend, nominations] =
    await Promise.all([
      db
        .select({
          total: count(),
          intakeCompleted: sql<number>`count(*) filter (where ${user.profileCompletedAt} is not null)::int`,
          instructionPassed: sql<number>`count(*) filter (where ${user.policyReadyVersion} = ${policy.version} and ${policy.version} > 0)::int`,
        })
        .from(user),
      db
        .select({
          draft: sql<number>`count(*) filter (where ${episode.status} = 'draft')::int`,
          submitted: sql<number>`count(*) filter (where ${episode.status} = 'submitted')::int`,
          folders: sql<number>`count(*) filter (where ${episode.status} = 'submitted' and ${episode.isFolder})::int`,
          related: sql<number>`count(*) filter (where ${episode.status} = 'submitted' and ${episode.creationMethod} = 'related_live')::int`,
          real: sql<number>`count(*) filter (where ${episode.status} = 'submitted' and ${episode.taskProvenance} = 'real')::int`,
          invented: sql<number>`count(*) filter (where ${episode.status} = 'submitted' and ${episode.taskProvenance} = 'invented')::int`,
          pending: sql<number>`count(*) filter (where ${episode.status} = 'submitted' and ${episode.assignmentState} = 'pending')::int`,
          ready: sql<number>`count(*) filter (where ${episode.status} = 'submitted' and ${episode.assignmentState} = 'ready')::int`,
          held: sql<number>`count(*) filter (where ${episode.status} = 'submitted' and ${episode.assignmentState} = 'held')::int`,
          withdrawn: sql<number>`count(*) filter (where ${episode.status} = 'submitted' and ${episode.assignmentState} = 'withdrawn')::int`,
        })
        .from(episode),
      // A session is a conversation someone actually typed into.
      db
        .select({
          total: count(),
          submitted: sql<number>`count(*) filter (where ${conversation.status} = 'submitted')::int`,
        })
        .from(conversation)
        .where(
          sql`exists (select 1 from ${message} m where m.conversation_id = ${outer(conversation.id)})`,
        ),
      db.execute<{ total: number; started: number; full: number }>(sql`
        select
          count(*)::int as total,
          count(*) filter (where done > 0)::int as started,
          count(*) filter (where done >= ${settings.reviewsPerView}::int)::int as full
        from (
          select v.id,
            (select count(*) from review_assignment a
              where a.view_id = v.id and a.purpose = 'primary' and a.state = 'completed') as done
          from review_view v
          join episode e on e.id = v.episode_id
          where e.assignment_state <> 'withdrawn'
        ) per_view
      `),
      db
        .select({
          reviews: sql<number>`count(*) filter (where ${reviewAssignment.state} = 'completed' and ${reviewAssignment.purpose} = 'primary')::int`,
          skips: sql<number>`count(*) filter (where ${reviewAssignment.state} = 'skipped')::int`,
          active: sql<number>`count(*) filter (where ${reviewAssignment.state} = 'active')::int`,
          activeAudits: sql<number>`count(*) filter (where ${reviewAssignment.state} = 'active' and ${reviewAssignment.purpose} = 'pair_audit')::int`,
          auditSkips: sql<number>`count(*) filter (where ${reviewAssignment.state} = 'skipped' and ${reviewAssignment.purpose} = 'pair_audit')::int`,
          expired: sql<number>`count(*) filter (where ${reviewAssignment.state} = 'expired')::int`,
        })
        .from(reviewAssignment),
      db.select({ n: count() }).from(pairAudit),
      db
        .select({
          tokens: sql<number>`coalesce(sum(${usageEvent.promptTokens} + ${usageEvent.completionTokens}), 0)::int`,
          cost: sql<number>`coalesce(sum(${usageEvent.costUsd}), 0)::float`,
        })
        .from(usageEvent)
        .where(gte(usageEvent.createdAt, since)),
      // Entries received, by track. Only the tracks that still exist.
      db
        .select({ track: nomination.track, n: count() })
        .from(nomination)
        .where(inArray(nomination.track, TRACK_VALUES))
        .groupBy(nomination.track),
    ]);

  const [viewRow] = views as unknown as { total: number; started: number; full: number }[];
  return {
    policyVersion: policy.version,
    reviewsPerView: settings.reviewsPerView,
    participants: people[0]?.total ?? 0,
    intakeCompleted: people[0]?.intakeCompleted ?? 0,
    instructionPassed: people[0]?.instructionPassed ?? 0,
    episodes: episodes[0] ?? {
      draft: 0,
      submitted: 0,
      folders: 0,
      related: 0,
      real: 0,
      invented: 0,
      pending: 0,
      ready: 0,
      held: 0,
      withdrawn: 0,
    },
    sessions: sessions[0] ?? { total: 0, submitted: 0 },
    views: viewRow ?? { total: 0, started: 0, full: 0 },
    reviews: assignments[0]?.reviews ?? 0,
    skips: assignments[0]?.skips ?? 0,
    activeAssignments: assignments[0]?.active ?? 0,
    activeAudits: assignments[0]?.activeAudits ?? 0,
    auditSkips: assignments[0]?.auditSkips ?? 0,
    expiredAssignments: assignments[0]?.expired ?? 0,
    pairAudits: audits[0]?.n ?? 0,
    nominations,
    spend: spend[0] ?? { tokens: 0, cost: 0 },
  };
}

export type ParticipantTableRow = {
  id: string;
  name: string;
  email: string;
  intake: unknown;
  intake_done: boolean;
  policy_ready: boolean;
  is_admin: boolean;
  banned: boolean;
  daily_token_budget: number | null;
  submitted: number;
  drafts: number;
  reviews: number;
  audits: number;
  skips: number;
  nominations: number;
  tokens: number;
  cost: number;
};

/**
 * One row per participant: what they made, and what they did as a reviewer.
 *
 * Raw counts. Skips are shown beside reviews because skipping what you
 * cannot judge is what reviewers are asked to do, and a count of reviews
 * alone would hide it.
 */
export async function participantTable() {
  const policy = await getPolicy();
  const rows = await db.execute<ParticipantTableRow>(sql`
    select
      u.id, u.name, u.email,
      p.intake,
      (u.profile_completed_at is not null) as intake_done,
      (${policy.version}::int > 0 and u.policy_ready_version = ${policy.version}::int) as policy_ready,
      coalesce(u.role = 'admin', false) as is_admin,
      coalesce(u.banned, false) as banned,
      u.daily_token_budget,
      coalesce(e.submitted, 0)::int      as submitted,
      coalesce(e.drafts, 0)::int         as drafts,
      coalesce(n.n, 0)::int              as nominations,
      coalesce(a.reviews, 0)::int        as reviews,
      coalesce(a.audits, 0)::int         as audits,
      coalesce(a.skips, 0)::int          as skips,
      coalesce(us.tokens, 0)::int        as tokens,
      coalesce(us.cost, 0)::float        as cost
    from "user" u
    left join profile p on p.user_id = u.id
    left join (
      select ep.user_id,
             count(*) filter (where ep.status = 'submitted') as submitted,
             -- A draft nobody typed into is not work in progress.
             count(*) filter (
               where ep.status = 'draft' and exists (
                 select 1 from conversation c
                 join message m on m.conversation_id = c.id
                 where c.episode_id = ep.id
               )
             ) as drafts
      from episode ep
      group by ep.user_id
    ) e on e.user_id = u.id
    left join (
      select user_id, count(*) as n from nomination
      where track in (${sql.join(TRACK_VALUES.map((t) => sql`${t}`), sql`, `)})
      group by user_id
    ) n on n.user_id = u.id
    left join (
      select reviewer_id,
             count(*) filter (where state = 'completed' and purpose = 'primary') as reviews,
             count(*) filter (where state = 'completed' and purpose = 'pair_audit') as audits,
             count(*) filter (where state = 'skipped') as skips
      from review_assignment group by reviewer_id
    ) a on a.reviewer_id = u.id
    left join (
      select user_id, sum(prompt_tokens + completion_tokens) as tokens,
             sum(cost_usd) as cost
      from usage_event group by user_id
    ) us on us.user_id = u.id
    order by u.name
  `);
  return rows as unknown as ParticipantTableRow[];
}

/**
 * One participant's account and intake, and what they did as a reviewer:
 * the reviews they completed, the comparisons they made, and what they
 * skipped and why. Their own work comes from participantHistory.
 */
export async function participantDetail(userId: string) {
  const [[account], [theirProfile], reviews, audits, skips, nominations] = await Promise.all([
    db.select().from(user).where(eq(user.id, userId)),
    db.select().from(profile).where(eq(profile.userId, userId)),
    db
      .select({
        id: reviewResponse.id,
        verdict: reviewResponse.verdict,
        policyBasis: reviewResponse.policyBasis,
        confidence: reviewResponse.confidence,
        evidenceMode: reviewResponse.evidenceMode,
        evidenceTurns: reviewResponse.evidenceTurns,
        rationale: reviewResponse.rationale,
        uncertaintyReasons: reviewResponse.uncertaintyReasons,
        uncertaintyOther: reviewResponse.uncertaintyOther,
        subjectSensitivity: reviewResponse.subjectSensitivity,
        aimEvidence: reviewResponse.aimEvidence,
        policyVersion: reviewResponse.policyVersion,
        submittedAt: reviewResponse.submittedAt,
        reservedAt: reviewAssignment.reservedAt,
        viewKind: reviewView.kind,
        episodeTitle: episode.title,
        authorId: episode.userId,
      })
      .from(reviewResponse)
      .innerJoin(reviewAssignment, eq(reviewAssignment.id, reviewResponse.assignmentId))
      .innerJoin(reviewView, eq(reviewView.id, reviewResponse.viewId))
      .innerJoin(episode, eq(episode.id, reviewView.episodeId))
      .where(eq(reviewResponse.reviewerId, userId))
      .orderBy(desc(reviewResponse.submittedAt)),
    db
      .select({
        id: pairAudit.id,
        topicTaskMatch: pairAudit.topicTaskMatch,
        scopeSimilarity: pairAudit.scopeSimilarity,
        mainDifference: pairAudit.mainDifference,
        auditNote: pairAudit.auditNote,
        submittedAt: pairAudit.submittedAt,
        comparisonIntent: relatedVersion.comparisonIntent,
        intendedDifference: relatedVersion.intendedDifference,
      })
      .from(pairAudit)
      .innerJoin(relatedVersion, eq(relatedVersion.id, pairAudit.relatedVersionId))
      .where(eq(pairAudit.reviewerId, userId))
      .orderBy(desc(pairAudit.submittedAt)),
    db
      .select({
        id: reviewAssignment.id,
        purpose: reviewAssignment.purpose,
        state: reviewAssignment.state,
        skipReason: reviewAssignment.skipReason,
        skipNote: reviewAssignment.skipNote,
        reservedAt: reviewAssignment.reservedAt,
        finishedAt: reviewAssignment.finishedAt,
      })
      .from(reviewAssignment)
      .where(
        and(
          eq(reviewAssignment.reviewerId, userId),
          inArray(reviewAssignment.state, ["skipped", "expired"]),
        ),
      )
      .orderBy(desc(reviewAssignment.finishedAt)),
    db
      .select({
        id: nomination.id,
        track: nomination.track,
        headline: nomination.headline,
        details: nomination.details,
        slidesUrl: nomination.slidesUrl,
        updatedAt: nomination.updatedAt,
      })
      .from(nomination)
      .where(and(eq(nomination.userId, userId), inArray(nomination.track, TRACK_VALUES))),
  ]);

  return { account, profile: theirProfile, reviews, audits, skips, nominations };
}

/**
 * Everything one participant has made, in full: each episode with what they
 * said about it, and every session inside it message by message.
 *
 * For reading, not counting: this is what an organizer scrolls through to
 * decide whether someone's work is careful. A fixed number of queries
 * whatever the number of episodes.
 */
export async function participantHistory(userId: string) {
  const settings = await getEventSettings();
  const [episodes, sessions, messages, clipboard, goalRevisions, links, views] =
    await Promise.all([
      db
        .select()
        .from(episode)
        .where(eq(episode.userId, userId))
        .orderBy(desc(episode.createdAt)),
      db
        .select({
          id: conversation.id,
          episodeId: conversation.episodeId,
          title: conversation.title,
          modelId: conversation.modelId,
          scenario: conversation.scenario,
          status: conversation.status,
          sessionOrder: conversation.sessionOrder,
          createdAt: conversation.createdAt,
          lockedAt: conversation.lockedAt,
          authorLabels: conversation.authorLabels,
        })
        .from(conversation)
        .where(eq(conversation.userId, userId))
        .orderBy(asc(conversation.sessionOrder), asc(conversation.createdAt)),
      db
        .select({
          id: message.id,
          conversationId: message.conversationId,
          seq: message.seq,
          role: message.role,
          content: message.content,
          finishReason: message.finishReason,
          failed: sql<boolean>`${message.error} is not null`,
          createdAt: message.createdAt,
        })
        .from(message)
        .innerJoin(conversation, eq(conversation.id, message.conversationId))
        .where(and(eq(conversation.userId, userId), sql`${message.supersededBy} is null`))
        .orderBy(message.conversationId, message.seq),
      // The author's own copying and pasting, summed up per session.
      db
        .select({
          conversationId: clipboardEvent.conversationId,
          kind: clipboardEvent.kind,
          surface: clipboardEvent.surface,
          times: sql<number>`count(*)::int`,
          characters: sql<number>`coalesce(sum(${clipboardEvent.charCount}), 0)::int`,
        })
        .from(clipboardEvent)
        .where(eq(clipboardEvent.userId, userId))
        .groupBy(clipboardEvent.conversationId, clipboardEvent.kind, clipboardEvent.surface),
      db
        .select({
          episodeId: episodeGoalRevision.episodeId,
          n: sql<number>`count(*)::int`,
          afterWorkBegan: sql<number>`count(*) filter (where ${episodeGoalRevision.afterWorkBegan})::int`,
        })
        .from(episodeGoalRevision)
        .innerJoin(episode, eq(episode.id, episodeGoalRevision.episodeId))
        .where(eq(episode.userId, userId))
        .groupBy(episodeGoalRevision.episodeId),
      // Related-version links this person made, either end.
      db
        .select({
          id: relatedVersion.id,
          sourceEpisodeId: relatedVersion.sourceEpisodeId,
          targetEpisodeId: relatedVersion.targetEpisodeId,
          comparisonIntent: relatedVersion.comparisonIntent,
          intendedDifference: relatedVersion.intendedDifference,
        })
        .from(relatedVersion)
        .where(eq(relatedVersion.createdBy, userId)),
      // What reviewers said, per view of each episode.
      db
        .select({
          viewId: reviewView.id,
          episodeId: reviewView.episodeId,
          kind: reviewView.kind,
          conversationId: reviewView.conversationId,
          verdicts: sql<string[]>`coalesce(
            (select array_agg(r.verdict order by r.submitted_at)
               from review_response r where r.view_id = ${outer(reviewView.id)}),
            '{}'::text[])`,
        })
        .from(reviewView)
        .innerJoin(episode, eq(episode.id, reviewView.episodeId))
        .where(eq(episode.userId, userId)),
    ]);

  const group = <T, K extends string | null>(rows: T[], key: (row: T) => K) => {
    const grouped = new Map<string, T[]>();
    for (const row of rows) {
      const k = key(row);
      if (!k) continue;
      const list = grouped.get(k);
      if (list) list.push(row);
      else grouped.set(k, [row]);
    }
    return grouped;
  };
  const messagesFor = group(messages, (m) => m.conversationId);
  const clipboardFor = group(clipboard, (c) => c.conversationId);
  const sessionsFor = group(sessions, (s) => s.episodeId);
  const viewsFor = group(views, (v) => v.episodeId);
  const revisionsFor = new Map(goalRevisions.map((g) => [g.episodeId, g]));
  const titleOf = new Map(episodes.map((e) => [e.id, e.title]));

  return episodes.map((ep) => {
    const own = (sessionsFor.get(ep.id) ?? []).map((s) => ({
      ...s,
      messages: (messagesFor.get(s.id) ?? []).map((m, i) => ({
        id: m.id,
        turn: i + 1,
        role: m.role,
        content: m.content,
        finishReason: m.finishReason,
        failed: m.failed,
      })),
      clipboard: clipboardFor.get(s.id) ?? [],
    }));
    // The letters a reviewer saw: A, B, C over the sessions that were
    // submitted, in order.
    const letters = new Map(
      own.filter((s) => s.status === "submitted").map((s, i) => [s.id, sessionLetter(i + 1)]),
    );
    const asTarget = links.find((l) => l.targetEpisodeId === ep.id) ?? null;
    return {
      ...ep,
      submitted: ep.status === "submitted",
      sessions: own,
      messageCount: own.reduce((sum, s) => sum + s.messages.length, 0),
      goalRevisions: revisionsFor.get(ep.id) ?? { episodeId: ep.id, n: 0, afterWorkBegan: 0 },
      // If this was made as a related version of something.
      relatedTo: asTarget
        ? {
            ...asTarget,
            sourceTitle: titleOf.get(asTarget.sourceEpisodeId) ?? "an earlier submission",
          }
        : null,
      // Related versions made of this one.
      relatedVersions: links
        .filter((l) => l.sourceEpisodeId === ep.id)
        .map((l) => ({ ...l, targetTitle: titleOf.get(l.targetEpisodeId) ?? "a draft" })),
      views: (viewsFor.get(ep.id) ?? []).map((v) => ({
        id: v.viewId,
        name:
          v.kind === "linked"
            ? "All sessions together"
            : letters.size > 1 && v.conversationId
              ? `Session ${letters.get(v.conversationId) ?? "?"}`
              : "The conversation",
        verdicts: v.verdicts,
        outcome: panelOutcome(v.verdicts, settings.reviewsPerView),
      })),
    };
  });
}

export type SubmissionState = "pending" | "ready" | "held" | "withdrawn";

type ViewCoverageRow = {
  view_id: string;
  episode_id: string;
  kind: string;
  conversation_id: string | null;
  session_order: number | null;
  completed: number;
  active: number;
  skipped: number;
  expired: number;
  verdicts: string[];
};

/**
 * Every submitted episode, newest first, with who may review it and how far
 * the reviewing has got on each thing a reviewer can be shown.
 */
export async function submissionsList(state?: SubmissionState) {
  const settings = await getEventSettings();
  // A join, so the columns below are written with their tables.
  const hasSubmission = sql`(${episode.status} = 'submitted' or exists (
    select 1 from conversation c where c.episode_id = ${episode.id} and c.status = 'submitted'
  ))`;
  const episodes = await db
    .select({
      id: episode.id,
      status: episode.status,
      title: episode.title,
      isFolder: episode.isFolder,
      modelId: episode.modelId,
      taskProvenance: episode.taskProvenance,
      activityTemplate: episode.activityTemplate,
      creationMethod: episode.creationMethod,
      sourceFamilyId: episode.sourceFamilyId,
      submittedAt: episode.submittedAt,
      reviewLevel: episode.reviewLevel,
      eligibleDomains: episode.eligibleDomains,
      assignmentState: episode.assignmentState,
      authorId: user.id,
      authorName: user.name,
      sessions: sql<number>`(
        select count(*) from conversation c
        where c.episode_id = ${outer(episode.id)} and c.status = 'submitted'
      )::int`,
    })
    .from(episode)
    .innerJoin(user, eq(user.id, episode.userId))
    .where(
      // Anything a reviewer could be shown: a submitted conversation or
      // folder, or a folder still open with a session submitted by itself.
      state ? and(hasSubmission, eq(episode.assignmentState, state)) : hasSubmission,
    )
    .orderBy(sql`coalesce(${episode.submittedAt}, ${episode.updatedAt}) desc`);
  if (episodes.length === 0) return [];

  const ids = episodes.map((e) => e.id);
  const idList = sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`, `,
  );
  const [coverage, links] = await Promise.all([
    db.execute<ViewCoverageRow>(sql`
      select
        v.id as view_id, v.episode_id, v.kind, v.conversation_id,
        c.session_order,
        count(a.id) filter (where a.state = 'completed')::int as completed,
        count(a.id) filter (where a.state = 'active')::int as active,
        count(a.id) filter (where a.state = 'skipped')::int as skipped,
        count(a.id) filter (where a.state = 'expired')::int as expired,
        coalesce(
          (select array_agg(r.verdict order by r.submitted_at)
             from review_response r where r.view_id = v.id),
          '{}'::text[]) as verdicts
      from review_view v
      left join conversation c on c.id = v.conversation_id
      left join review_assignment a on a.view_id = v.id and a.purpose = 'primary'
      where v.episode_id in (${idList})
      group by v.id, c.session_order
      order by v.kind desc, c.session_order asc nulls last
    `),
    // Pairs these episodes belong to, with the audit if one was done.
    db
      .select({
        id: relatedVersion.id,
        sourceEpisodeId: relatedVersion.sourceEpisodeId,
        targetEpisodeId: relatedVersion.targetEpisodeId,
        comparisonIntent: relatedVersion.comparisonIntent,
        intendedDifference: relatedVersion.intendedDifference,
        sourceTitle: sql<string>`(select title from episode s where s.id = ${outer(relatedVersion.sourceEpisodeId)})`,
        targetTitle: sql<string>`(select title from episode t where t.id = ${outer(relatedVersion.targetEpisodeId)})`,
        targetStatus: sql<string>`(select status from episode t where t.id = ${outer(relatedVersion.targetEpisodeId)})`,
        auditMainDifference: pairAudit.mainDifference,
        auditDone: sql<boolean>`${pairAudit.id} is not null`,
        auditInProgress: sql<boolean>`exists (
          select 1 from review_assignment a
          where a.related_version_id = ${outer(relatedVersion.id)}
            and a.purpose = 'pair_audit' and a.state = 'active')`,
      })
      .from(relatedVersion)
      .leftJoin(pairAudit, eq(pairAudit.relatedVersionId, relatedVersion.id))
      .where(
        sql`${relatedVersion.sourceEpisodeId} in (${idList}) or ${relatedVersion.targetEpisodeId} in (${idList})`,
      ),
  ]);

  const byEpisode = new Map<string, ViewCoverageRow[]>();
  for (const row of coverage as unknown as ViewCoverageRow[]) {
    const list = byEpisode.get(row.episode_id);
    if (list) list.push(row);
    else byEpisode.set(row.episode_id, [row]);
  }

  return episodes.map((ep) => {
    const rows = byEpisode.get(ep.id) ?? [];
    const sessionViews = rows.filter((r) => r.kind === "session");
    const views = [
      ...sessionViews.map((r, i) => ({
        ...r,
        name: sessionViews.length > 1 ? `Session ${sessionLetter(i + 1)}` : "Conversation",
      })),
      ...rows.filter((r) => r.kind === "linked").map((r) => ({ ...r, name: "All sessions together" })),
    ].map((r) => ({
      id: r.view_id,
      name: r.name,
      completed: r.completed,
      active: r.active,
      skipped: r.skipped,
      expired: r.expired,
      outcome: panelOutcome(r.verdicts, settings.reviewsPerView),
    }));
    return {
      ...ep,
      views,
      // The pair this episode is the newer half of, if it is one.
      relatedTo: links.find((l) => l.targetEpisodeId === ep.id) ?? null,
      // Related versions made of this one.
      relatedVersions: links.filter((l) => l.sourceEpisodeId === ep.id),
    };
  });
}

/**
 * Who is able to review what: how many people have passed the instruction
 * check for the policy in force, and for each subject how many of them say
 * they can assess routine work (F2 or F3) or specialised work (F3) in it.
 *
 * This is what to look at before marking something Routine or Specialist in
 * a subject: with nobody in the right-hand columns, it will sit unreviewed.
 */
export async function reviewerPool() {
  const policy = await getPolicy();
  const people = await db
    .select({ id: user.id, policyReadyVersion: user.policyReadyVersion, intake: profile.intake })
    .from(user)
    .leftJoin(profile, eq(profile.userId, user.id))
    .where(sql`${user.profileCompletedAt} is not null and coalesce(${user.banned}, false) = false`);

  const ready = people.filter((p) => p.policyReadyVersion === policy.version);
  const tally = (list: typeof people) =>
    DOMAINS.filter((d) => d.id !== "other").map((d) => {
      const levels = list.map(
        (p) => ((p.intake ?? {}) as Partial<IntakeDraft>).familiarity?.[d.id] ?? null,
      );
      return {
        id: d.id,
        label: d.label,
        routine: levels.filter((l) => l === "F2" || l === "F3").length,
        specialist: levels.filter((l) => l === "F3").length,
      };
    });
  return {
    policyVersion: policy.version,
    onboarded: people.length,
    ready: ready.length,
    // Among those who can review now, and among everyone who has joined.
    domains: tally(ready).map((row, i) => ({ ...row, everyone: tally(people)[i] })),
  };
}

/** Nominations for the organizers to read, newest first within a track. */
export async function nominationsByTrack() {
  return db
    .select({
      id: nomination.id,
      track: nomination.track,
      headline: nomination.headline,
      details: nomination.details,
      slidesUrl: nomination.slidesUrl,
      collaborators: nomination.collaborators,
      updatedAt: nomination.updatedAt,
      submissionCount: nomination.submissionCount,
      name: user.name,
      email: user.email,
    })
    .from(nomination)
    .innerJoin(user, eq(user.id, nomination.userId))
    .where(inArray(nomination.track, TRACK_VALUES))
    .orderBy(nomination.track, desc(nomination.updatedAt));
}

/** Every published version of the review policy, newest first. */
export async function listPolicyVersions() {
  const rows = await db.select().from(reviewPolicy).orderBy(desc(reviewPolicy.version));
  return rows.map((r) => ({
    version: r.version,
    body: r.body,
    rules: (r.rules ?? []) as { id: string; label: string; verdicts: string[] }[],
    publishedAt: r.publishedAt,
  }));
}

/** How many accounts have passed the instruction check for a version. */
export async function policyReadiness(version: number) {
  const [row] = await db
    .select({
      total: count(),
      ready: sql<number>`count(*) filter (where ${user.policyReadyVersion} = ${version} and ${version} > 0)::int`,
      // Responses already made under any version: they keep the version
      // they were made under, whatever is published next.
      responses: sql<number>`(select count(*) from review_response)::int`,
    })
    .from(user);
  return { total: row?.total ?? 0, ready: row?.ready ?? 0, responses: row?.responses ?? 0 };
}
