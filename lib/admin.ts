import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  conversation,
  judgeRun,
  message,
  nomination,
  profile,
  review,
  transcriptLabels,
  usageEvent,
  user,
} from "@/db/schema";

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
      .select({ type: transcriptLabels.type, n: count() })
      .from(transcriptLabels)
      .innerJoin(conversation, eq(conversation.id, transcriptLabels.conversationId))
      .where(eq(conversation.status, "submitted"))
      .groupBy(transcriptLabels.type),
    db
      .select({ behaviour: transcriptLabels.modelBehaviour, n: count() })
      .from(transcriptLabels)
      .innerJoin(conversation, eq(conversation.id, transcriptLabels.conversationId))
      .where(eq(conversation.status, "submitted"))
      .groupBy(transcriptLabels.modelBehaviour),
    db.select({ n: count() }).from(review),
    db.select({ track: nomination.track, n: count() }).from(nomination).groupBy(nomination.track),
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
             count(*) filter (where conv.status = 'submitted' and tl.type = 'benign') as benign,
             count(*) filter (where conv.status = 'submitted' and tl.type = 'dual_use') as dual_use,
             count(*) filter (where conv.status = 'submitted' and tl.type = 'adversarial') as adversarial,
             max(conv.last_submitted_at) as last_at
      from conversation conv
      left join transcript_labels tl on tl.conversation_id = conv.id
      group by conv.user_id
    ) c on c.user_id = u.id
    left join (
      select reviewer_id, count(*) as n, max(updated_at) as last_at
      from review group by reviewer_id
    ) r on r.reviewer_id = u.id
    left join (
      select user_id, count(*) as n from nomination group by user_id
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

/** Everything one participant produced, for an offline quality judgement. */
export async function participantDetail(userId: string) {
  const [[account], [theirProfile], conversations, reviews, nominations] =
    await Promise.all([
      db.select().from(user).where(eq(user.id, userId)),
      db.select().from(profile).where(eq(profile.userId, userId)),
      db
        .select({
          id: conversation.id,
          title: conversation.title,
          modelId: conversation.modelId,
          status: conversation.status,
          currentVersion: conversation.currentVersion,
          lastSubmittedAt: conversation.lastSubmittedAt,
          createdAt: conversation.createdAt,
          lockedAt: conversation.lockedAt,
          type: transcriptLabels.type,
          behaviour: transcriptLabels.modelBehaviour,
          goalText: transcriptLabels.goalText,
          turns: sql<number>`(select count(*) from ${message} m where m.conversation_id = ${conversation.id} and m.superseded_by is null)::int`,
        })
        .from(conversation)
        .leftJoin(transcriptLabels, eq(transcriptLabels.conversationId, conversation.id))
        .where(eq(conversation.userId, userId))
        .orderBy(desc(conversation.createdAt)),
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
      db.select().from(nomination).where(eq(nomination.userId, userId)),
    ]);

  return { account, profile: theirProfile, conversations, reviews, nominations };
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
    .orderBy(nomination.track, desc(nomination.updatedAt));
}

/** Transcripts a reviewer has not been able to reach, for spotting a stall. */
export async function reviewCoverage() {
  const [row] = await db
    .select({
      submitted: sql<number>`count(*) filter (where ${conversation.status} = 'submitted')::int`,
      reviewed: sql<number>`count(*) filter (where ${review.id} is not null)::int`,
    })
    .from(conversation)
    .leftJoin(review, eq(review.conversationId, conversation.id))
    .where(and(eq(conversation.status, "submitted")));
  return row ?? { submitted: 0, reviewed: 0 };
}
