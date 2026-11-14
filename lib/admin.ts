import { and, count, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { TRACK_VALUES } from "@/lib/nominations";
import { db } from "@/db";
import {
  clipboardEvent,
  conversation,
  judgeRun,
  message,
  nomination,
  profile,
  review,
  submission,
  transcriptLabels,
  usageEvent,
  user,
} from "@/db/schema";

/**
 * A label as it was submitted, read from the current version's snapshot.
 *
 * The transcript_labels row is the author's working copy: it is saved as
 * they type, and they can go on editing it after submitting, towards a
 * version they may never submit. Counting from it meant relabelling a
 * submitted transcript and pressing Save moved it between prize columns
 * with no new version to show for it. What was submitted is in the
 * snapshot, and that is what the organizers are counting.
 */
const submittedLabel = (field: "type" | "modelBehaviour" | "goalText") =>
  // The field name is written into the query rather than bound. As a bound
  // value, the same expression in SELECT and GROUP BY would carry two
  // different parameters and Postgres would not recognise them as one.
  sql<string | null>`${submission.snapshot}->'labels'->>${sql.raw(`'${field}'`)}`;

/** Joins a conversation to the snapshot of its current submitted version. */
const currentSubmission = and(
  eq(submission.conversationId, conversation.id),
  eq(submission.version, conversation.currentVersion),
);

/** Headline numbers for the overview. */
export async function overview() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [
    participants,
    conversations,
    byType,
    byBehaviour,
    reviews,
    nominations,
    spend,
    judgeRuns,
  ] = await Promise.all([
    db.select({ n: count() }).from(user),
    db
      .select({
        total: count(),
        submitted: sql<number>`count(*) filter (where ${conversation.status} = 'submitted')::int`,
      })
      .from(conversation),
    db
      .select({ type: submittedLabel("type"), n: count() })
      .from(conversation)
      .innerJoin(submission, currentSubmission)
      .where(eq(conversation.status, "submitted"))
      .groupBy(submittedLabel("type")),
    db
      .select({ behaviour: submittedLabel("modelBehaviour"), n: count() })
      .from(conversation)
      .innerJoin(submission, currentSubmission)
      .where(eq(conversation.status, "submitted"))
      .groupBy(submittedLabel("modelBehaviour")),
    db.select({ n: count() }).from(review),
    db
      .select({ track: nomination.track, n: count() })
      .from(nomination)
      .where(inArray(nomination.track, TRACK_VALUES))
      .groupBy(nomination.track),
    db
      .select({
        tokens: sql<number>`coalesce(sum(${usageEvent.promptTokens} + ${usageEvent.completionTokens}), 0)::int`,
        cost: sql<number>`coalesce(sum(${usageEvent.costUsd}), 0)::float`,
      })
      .from(usageEvent)
      .where(gte(usageEvent.createdAt, since)),
    db
      .select({
        total: count(),
        failed: sql<number>`count(*) filter (where ${judgeRun.status} <> 'ok')::int`,
      })
      .from(judgeRun),
  ]);

  return {
    participants: participants[0]?.n ?? 0,
    conversations: conversations[0] ?? { total: 0, submitted: 0 },
    byType,
    byBehaviour,
    reviews: reviews[0]?.n ?? 0,
    nominations,
    spend: spend[0] ?? { tokens: 0, cost: 0 },
    judgeRuns: judgeRuns[0] ?? { total: 0, failed: 0 },
  };
}

/**
 * One row per participant, carrying both counted prizes.
 *
 * The benign count is transcripts the author submitted and labelled benign;
 * the review count is reviews they completed. Quality is judged offline, so
 * these are raw counts and the audit view is how you look behind them.
 */
export async function participantTable() {
  const rows = await db.execute<{
    id: string;
    name: string;
    email: string;
    affiliation: string | null;
    role: string | null;
    is_admin: boolean;
    banned: boolean;
    daily_token_budget: number | null;
    submitted: number;
    benign: number;
    dual_use: number;
    adversarial: number;
    reviews: number;
    nominations: number;
    tokens: number;
    cost: number;
    last_active: Date | null;
  }>(sql`
    select
      u.id, u.name, u.email,
      p.affiliation, p.role,
      (u.role = 'admin') as is_admin,
      coalesce(u.banned, false) as banned,
      u.daily_token_budget,
      coalesce(c.submitted, 0)::int     as submitted,
      coalesce(c.benign, 0)::int        as benign,
      coalesce(c.dual_use, 0)::int      as dual_use,
      coalesce(c.adversarial, 0)::int   as adversarial,
      coalesce(r.n, 0)::int             as reviews,
      coalesce(n.n, 0)::int             as nominations,
      coalesce(us.tokens, 0)::int       as tokens,
      coalesce(us.cost, 0)::float       as cost,
      greatest(c.last_at, r.last_at)    as last_active
    from "user" u
    left join profile p on p.user_id = u.id
    left join (
      select conv.user_id,
             count(*) filter (where conv.status = 'submitted') as submitted,
             count(*) filter (where conv.status = 'submitted' and s.snapshot->'labels'->>'type' = 'benign') as benign,
             count(*) filter (where conv.status = 'submitted' and s.snapshot->'labels'->>'type' = 'dual_use') as dual_use,
             count(*) filter (where conv.status = 'submitted' and s.snapshot->'labels'->>'type' = 'adversarial') as adversarial,
             max(conv.last_submitted_at) as last_at
      from conversation conv
      -- The labels as submitted, not the author's working copy.
      left join submission s
        on s.conversation_id = conv.id and s.version = conv.current_version
      group by conv.user_id
    ) c on c.user_id = u.id
    left join (
      select reviewer_id, count(*) as n, max(updated_at) as last_at
      from review group by reviewer_id
    ) r on r.reviewer_id = u.id
    left join (
      select user_id, count(*) as n from nomination
      where track in (${sql.join(TRACK_VALUES.map((t) => sql`${t}`), sql`, `)})
      group by user_id
    ) n on n.user_id = u.id
    left join (
      select user_id, sum(prompt_tokens + completion_tokens) as tokens,
             sum(cost_usd) as cost
      from usage_event group by user_id
    ) us on us.user_id = u.id
    order by u.name
  `);
  return rows as unknown as Array<{
    id: string;
    name: string;
    email: string;
    affiliation: string | null;
    role: string | null;
    is_admin: boolean;
    banned: boolean;
    daily_token_budget: number | null;
    submitted: number;
    benign: number;
    dual_use: number;
    adversarial: number;
    reviews: number;
    nominations: number;
    tokens: number;
    cost: number;
    last_active: Date | null;
  }>;
}

/**
 * One participant's account, what they wrote about other people's
 * transcripts, and what they put forward. Their own conversations come from
 * participantHistory.
 */
export async function participantDetail(userId: string) {
  const [[account], [theirProfile], reviews, nominations] = await Promise.all([
    db.select().from(user).where(eq(user.id, userId)),
    db.select().from(profile).where(eq(profile.userId, userId)),
    db
      .select({
        conversationId: review.conversationId,
        intent: review.intent,
        misusePresent: review.misusePresent,
        actor: review.actor,
        goalText: review.goalText,
        confidence: review.confidence,
        notes: review.notes,
        updatedAt: review.updatedAt,
        submissionCount: review.submissionCount,
        title: conversation.title,
      })
      .from(review)
      .innerJoin(conversation, eq(conversation.id, review.conversationId))
      .where(eq(review.reviewerId, userId))
      .orderBy(desc(review.updatedAt)),
    db
      .select()
      .from(nomination)
      .where(
        and(eq(nomination.userId, userId), inArray(nomination.track, TRACK_VALUES)),
      ),
  ]);

  return { account, profile: theirProfile, reviews, nominations };
}

/** The labels as a snapshot or a working copy carries them. */
export type HistoryLabels = {
  type?: string | null;
  rolePreset?: string | null;
  roleText?: string | null;
  goalText?: string | null;
  modelBehaviour?: string | null;
  domainTags?: string[] | null;
  domainOther?: string | null;
  evidenceTurns?: number[] | null;
  challengeFlag?: string | null;
  notes?: string | null;
};

/**
 * Every conversation one participant has had, in full, with its labels.
 *
 * For reading, not counting: this is what an organizer scrolls through to
 * decide whether someone's transcripts and labels are careful work. Four
 * queries whatever the number of conversations, so a prolific participant
 * does not make the page slow.
 *
 * For a submitted conversation the labels are the ones submitted with its
 * current version. For one never submitted they are whatever the author had
 * filled in so far.
 */
export async function participantHistory(userId: string) {
  const [conversations, messages, reviews, clipboard] = await Promise.all([
    db
      .select({
        id: conversation.id,
        title: conversation.title,
        modelId: conversation.modelId,
        scenario: conversation.scenario,
        status: conversation.status,
        currentVersion: conversation.currentVersion,
        createdAt: conversation.createdAt,
        lastSubmittedAt: conversation.lastSubmittedAt,
        lockedAt: conversation.lockedAt,
        submittedLabels: sql<HistoryLabels | null>`${submission.snapshot}->'labels'`,
        // Which messages made up the submitted version, by id: an author
        // can keep chatting after submitting.
        submittedMessageIds: sql<string[] | null>`(
          select array_agg(m->>'id')
          from jsonb_array_elements(${submission.snapshot}->'messages') m
        )`,
        draftLabels: {
          type: transcriptLabels.type,
          rolePreset: transcriptLabels.rolePreset,
          roleText: transcriptLabels.roleText,
          goalText: transcriptLabels.goalText,
          modelBehaviour: transcriptLabels.modelBehaviour,
          domainTags: transcriptLabels.domainTags,
          domainOther: transcriptLabels.domainOther,
          evidenceTurns: transcriptLabels.evidenceTurns,
          challengeFlag: transcriptLabels.challengeFlag,
          notes: transcriptLabels.notes,
        },
      })
      .from(conversation)
      .leftJoin(transcriptLabels, eq(transcriptLabels.conversationId, conversation.id))
      .leftJoin(submission, currentSubmission)
      .where(eq(conversation.userId, userId))
      .orderBy(desc(conversation.createdAt)),
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
    // What other people said about these transcripts.
    db
      .select({
        conversationId: review.conversationId,
        reviewerName: user.name,
        intent: review.intent,
        misusePresent: review.misusePresent,
        actor: review.actor,
        goalText: review.goalText,
        confidence: review.confidence,
        notes: review.notes,
        reviewedVersion: review.reviewedVersion,
        submittedAt: review.submittedAt,
      })
      .from(review)
      .innerJoin(conversation, eq(conversation.id, review.conversationId))
      .innerJoin(user, eq(user.id, review.reviewerId))
      .where(eq(conversation.userId, userId))
      .orderBy(review.submittedAt),
    // The author's own copying and pasting, summed up per conversation.
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
  ]);

  const group = <T extends { conversationId: string | null }>(rows: T[]) => {
    const byConversation = new Map<string, T[]>();
    for (const row of rows) {
      if (!row.conversationId) continue;
      const list = byConversation.get(row.conversationId);
      if (list) list.push(row);
      else byConversation.set(row.conversationId, [row]);
    }
    return byConversation;
  };
  const messagesFor = group(messages);
  const reviewsFor = group(reviews);
  const clipboardFor = group(clipboard);

  return conversations.map(({ submittedLabels, draftLabels, submittedMessageIds, ...c }) => {
    const turns = messagesFor.get(c.id) ?? [];
    const submitted = c.status === "submitted";
    const labels: HistoryLabels | null = submitted ? submittedLabels : draftLabels;
    const inVersion = new Set(submittedMessageIds ?? []);
    const evidence = new Set(labels?.evidenceTurns ?? []);
    return {
      ...c,
      submitted,
      labels,
      messages: turns.map((m, i) => ({
        ...m,
        turn: i + 1,
        evidence: evidence.has(i + 1),
        // Only meaningful for a submitted conversation.
        afterSubmission: submitted && !inVersion.has(m.id),
      })),
      reviews: reviewsFor.get(c.id) ?? [],
      clipboard: clipboardFor.get(c.id) ?? [],
    };
  });
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

/**
 * How far the reviewing has got: of the submitted transcripts, how many have
 * no review, at least one, and as many as the limit allows.
 */
export async function reviewCoverage(limit: number) {
  const rows = await db.execute<{ submitted: number; reviewed: number; full: number }>(sql`
    select
      count(*)::int as submitted,
      count(*) filter (where n > 0)::int as reviewed,
      count(*) filter (where n >= ${limit}::int)::int as full
    from (
      select c.id, (select count(*) from review r where r.conversation_id = c.id) as n
      from conversation c
      where c.status = 'submitted'
    ) per_transcript
  `);
  const [row] = rows as unknown as { submitted: number; reviewed: number; full: number }[];
  return row ?? { submitted: 0, reviewed: 0, full: 0 };
}
