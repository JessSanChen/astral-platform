import { outer } from "@/lib/sql";
import { asc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  auditEvent,
  clipboardEvent,
  conversation,
  episode,
  episodeGoalRevision,
  judgeRun,
  message,
  nomination,
  pairAudit,
  profile,
  relatedVersion,
  review,
  reviewAssignment,
  reviewPolicy,
  reviewResponse,
  reviewView,
  submission,
  transcriptLabels,
  usageEvent,
  user,
} from "@/db/schema";
import { requireAdmin } from "@/lib/gate";
import { recordAudit } from "@/lib/audit";

/**
 * The whole dataset as JSONL: one record per line, each saying what it is
 * in its `record` field. Records point at each other by id, the way the
 * tables do, so nothing is repeated and nothing has to be guessed:
 *
 *   review_policy          every published version of the reference policy
 *   participant_intake     one per account: intake answers and agreements
 *   episode                a conversation, or a folder of sessions, with
 *                          what its author said about it and its routing
 *   episode_goal_revision  every saved version of an episode's goal note
 *   session                one conversation inside an episode, with every
 *                          message and the provider's raw request/response,
 *                          the frozen submission, and copy/paste events
 *   related_version        a link between a submission and its alternative
 *   review_view            exactly what a reviewer was shown, with its hash
 *   review_assignment      who was given what, however it ended (skips and
 *                          expiries included), and the routing basis
 *   review_response        form C answers, with the policy version applied
 *   pair_audit             form D answers
 *   clipboard_event        copy/paste not tied to a session
 *   usage_event            tokens and cost per request
 *   audit_event            what organizers did
 *   legacy_*               labels and reviews from before v1.1
 *   nomination             what people wrote up for a prize, one per track
 *   end                    always last, with a count of each kind
 *
 * Drafts are included, marked `"status": "draft"`: the messages exist
 * whether or not their author got as far as submitting. `?only=submitted`
 * leaves draft episodes and sessions out. A session nobody typed into is
 * never included.
 *
 * Streamed rather than assembled in memory, so the size of the day does not
 * decide whether this works.
 */
// As long as the platform allows. Sessions are written one at a time, and a
// full day of them takes a while.
export const maxDuration = 300;

export async function GET(req: Request) {
  const { user: me } = await requireAdmin();
  const submittedOnly = new URL(req.url).searchParams.get("only") === "submitted";
  // Everything anyone wrote leaves the platform here, so who took it and
  // when is worth being able to answer afterwards.
  await recordAudit({
    action: "export_downloaded",
    actor: me,
    detail: submittedOnly ? "Submitted work only." : "Everything.",
  });

  const hasMessages = sql`exists (
    select 1 from ${message} m where m.conversation_id = ${outer(conversation.id)}
  )`;
  const sessions = await db
    .select()
    .from(conversation)
    .where(
      submittedOnly
        ? sql`${conversation.status} = 'submitted' and ${hasMessages}`
        : hasMessages,
    )
    .orderBy(asc(conversation.createdAt));

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const counts: Record<string, number> = {};
      const emit = (record: string, fields: object) => {
        counts[record] = (counts[record] ?? 0) + 1;
        controller.enqueue(encoder.encode(JSON.stringify({ record, ...fields }) + "\n"));
      };

      // --- The review instructions, every version -----------------------
      // The record keeps the name it had when this was a rule-based policy.
      // A version with rules is from that time; one without is the shared
      // review definition. A review's review_instruction_version points here.
      for (const p of await db.select().from(reviewPolicy).orderBy(asc(reviewPolicy.version))) {
        emit("review_policy", {
          version: p.version,
          body: p.body,
          rules: p.rules,
          published_at: p.publishedAt,
        });
      }

      // --- People -------------------------------------------------------
      const people = await db
        .select({ account: user, profile })
        .from(user)
        .leftJoin(profile, eq(profile.userId, user.id))
        .orderBy(asc(user.createdAt));
      for (const { account, profile: p } of people) {
        emit("participant_intake", {
          user_id: account.id,
          name: account.name,
          email: account.email,
          is_organizer: account.role === "admin",
          created_at: account.createdAt,
          terms_version: account.termsVersion,
          terms_accepted_at: account.termsAcceptedAt,
          intake_completed_at: account.profileCompletedAt,
          // The policy version whose instruction check they last passed.
          policy_ready_version: account.policyReadyVersion,
          intake_version: p?.intakeVersion ?? null,
          intake: p?.intake ?? null,
          participation_agreed_at: p?.participationAgreedAt ?? null,
          research_use_agreed_at: p?.researchUseAgreedAt ?? null,
          public_release_permission: p?.publicReleasePermission ?? null,
          intake_updated_at: p?.updatedAt ?? null,
          // Answers to the questions asked before v1.1, where any exist.
          legacy_profile:
            p && (p.affiliation || p.role || p.highestDegree || p.primaryBackground)
              ? {
                  affiliation: p.affiliation,
                  role: p.role,
                  role_other: p.roleOther,
                  highest_degree: p.highestDegree,
                  highest_degree_other: p.highestDegreeOther,
                  years_experience: p.yearsExperience,
                  primary_background: p.primaryBackground,
                  primary_background_other: p.primaryBackgroundOther,
                  subdomains: p.subdomains,
                  subdomains_other: p.subdomainsOther,
                  ai_familiarity: p.aiFamiliarity,
                  expertise_note: p.expertiseNote,
                }
              : null,
        });
      }

      // --- Episodes and their goal notes --------------------------------
      const episodes = await db
        .select()
        .from(episode)
        .where(
          // A folder still open counts once one of its sessions has been
          // submitted by itself; only that session's messages go with it.
          submittedOnly
            ? sql`${episode.status} = 'submitted' or exists (
                select 1 from ${conversation} c
                where c.episode_id = ${outer(episode.id)} and c.status = 'submitted')`
            : undefined,
        )
        .orderBy(asc(episode.createdAt));
      const exported = new Set(episodes.map((e) => e.id));
      for (const e of episodes) {
        emit("episode", {
          episode_id: e.id,
          user_id: e.userId,
          title: e.title,
          is_folder: e.isFolder,
          model_id: e.modelId,
          task_provenance: e.taskProvenance,
          provenance_changed_at: e.provenanceChangedAt,
          activity_template: e.activityTemplate,
          // Private to the author: never sent to the model, never shown to
          // a reviewer.
          goal_text: e.goalText,
          goal_updated_at: e.goalUpdatedAt,
          // The author's own answers about the work (role, kind of task,
          // scenario, what they expected a reviewer to decide). Author-only,
          // like the goal: never part of what a reviewer was shown.
          author_labels: e.authorLabels,
          author_labels_version: e.authorLabelsVersion,
          author_labels_updated_at: e.authorLabelsUpdatedAt,
          creation_method: e.creationMethod,
          source_family_id: e.sourceFamilyId,
          status: e.status,
          submitted_at: e.submittedAt,
          review_level: e.reviewLevel,
          eligible_domains: e.eligibleDomains,
          assignment_state: e.assignmentState,
          prize_entry_at: e.prizeEntryAt,
          created_at: e.createdAt,
          updated_at: e.updatedAt,
        });
      }
      const revisions = await db
        .select()
        .from(episodeGoalRevision)
        .orderBy(asc(episodeGoalRevision.savedAt));
      for (const g of revisions) {
        if (!exported.has(g.episodeId)) continue;
        emit("episode_goal_revision", {
          id: g.id,
          episode_id: g.episodeId,
          // Set when the goal is one session's, in a folder; empty when
          // it is the goal of the whole conversation or folder.
          conversation_id: g.conversationId,
          goal_text: g.goalText,
          after_work_began: g.afterWorkBegan,
          saved_at: g.savedAt,
        });
      }

      // --- Sessions, one at a time: these carry the bulk ----------------
      for (const convo of sessions) {
        const [messages, submissions, judgeRuns, clipboard] = await Promise.all([
          db
            .select()
            .from(message)
            .where(eq(message.conversationId, convo.id))
            .orderBy(asc(message.seq)),
          db
            .select()
            .from(submission)
            .where(eq(submission.conversationId, convo.id))
            .orderBy(asc(submission.version)),
          db.select().from(judgeRun).where(eq(judgeRun.conversationId, convo.id)),
          db
            .select()
            .from(clipboardEvent)
            .where(eq(clipboardEvent.conversationId, convo.id))
            .orderBy(asc(clipboardEvent.createdAt)),
        ]);

        // What was frozen at submission. Since v1.1 a submitted session is
        // locked, so this is every message; conversations from before then
        // could run on past it.
        const frozen = submissions.find((s) => s.version === convo.currentVersion)?.snapshot as
          | { messages?: { id?: string }[] }
          | undefined;
        const submittedIds = new Set((frozen?.messages ?? []).map((m) => m.id));

        // Turn numbers are the ones shown beside each message: replies
        // that were regenerated away (before v1.1) are not counted.
        const turnOf = new Map<string, number>();
        for (const m of messages) {
          if (m.supersededBy == null) turnOf.set(m.id, turnOf.size + 1);
        }

        emit("session", {
          session_id: convo.id,
          // Kept under its older name too, for anything written against the
          // earlier export.
          conversation_id: convo.id,
          episode_id: convo.episodeId,
          session_order: convo.sessionOrder,
          user_id: convo.userId,
          // "submitted" or "draft".
          status: convo.status,
          title: convo.title,
          model_id: convo.modelId,
          // What the author said about this session: role, kind of task,
          // scenario, what they expected a reviewer to decide, whether the
          // task was real, and the optional goal. In a folder each session
          // has its own; the folder's are on its episode. For a conversation
          // that stands alone these are a copy of what its episode holds,
          // kept up to date with every change, drafts included.
          author_labels: convo.authorLabels,
          author_labels_version: convo.authorLabelsVersion,
          author_labels_updated_at: convo.authorLabelsUpdatedAt,
          // For a session in a folder; a conversation's is on its episode.
          provenance_changed_at: convo.provenanceChangedAt,
          scenario: convo.scenario,
          created_at: convo.createdAt,
          submitted_at: convo.lastSubmittedAt,
          version: convo.currentVersion,
          locked_at: convo.lockedAt,
          last_message_at: convo.lastMessageAt,
          submitted_message_count: submittedIds.size,
          messages: messages.map((m) => ({
            message_id: m.id,
            seq: m.seq,
            // The number shown beside the message; null for a reply that
            // was regenerated away.
            turn: turnOf.get(m.id) ?? null,
            in_submitted_version: submittedIds.has(m.id),
            role: m.role,
            content: m.content,
            model_id: m.modelId,
            provider: m.provider,
            generation_id: m.generationId,
            finish_reason: m.finishReason,
            prompt_tokens: m.promptTokens,
            completion_tokens: m.completionTokens,
            reasoning_tokens: m.reasoningTokens,
            cost_usd: m.costUsd,
            latency_ms: m.latencyMs,
            superseded: m.supersededBy != null,
            error: m.error,
            raw_request: m.rawRequest,
            raw_response: m.rawResponse,
            created_at: m.createdAt,
          })),
          submissions: submissions.map((s) => ({
            version: s.version,
            submitted_at: s.submittedAt,
            snapshot: s.snapshot,
          })),
          scanner_runs: judgeRuns.map((j) => ({
            judge_config_id: j.judgeConfigId,
            turn_count: j.turnCount,
            verdict: j.verdict,
            parsed: j.parsed,
            raw_output: j.rawOutput,
            status: j.status,
            created_at: j.createdAt,
          })),
          // Copying and pasting while this session was open, in order. A
          // reviewer's, made while reading the record this session is part
          // of, has surface "review".
          clipboard_events: clipboard.map((c) => ({
            by: c.userId === convo.userId ? ("author" as const) : ("reviewer" as const),
            user_id: c.userId,
            kind: c.kind,
            surface: c.surface,
            turn: c.turn,
            role: c.role,
            char_count: c.charCount,
            content: c.content,
            created_at: c.createdAt,
          })),
        });
      }

      // --- Related versions, and everything about reviewing --------------
      for (const l of await db.select().from(relatedVersion).orderBy(asc(relatedVersion.createdAt))) {
        if (submittedOnly && !(exported.has(l.sourceEpisodeId) && exported.has(l.targetEpisodeId)))
          continue;
        emit("related_version", {
          id: l.id,
          source_episode_id: l.sourceEpisodeId,
          target_episode_id: l.targetEpisodeId,
          // The two single conversations the link is between. The episode
          // ids above say which conversation or folder each belongs to.
          source_conversation_id: l.sourceConversationId,
          target_conversation_id: l.targetConversationId,
          family_id: l.familyId,
          comparison_intent: l.comparisonIntent,
          intended_difference: l.intendedDifference,
          // When the author last reworded either answer after creating the
          // version; null if they stand as first given.
          intent_revised_at: l.intentRevisedAt,
          created_by: l.createdBy,
          created_at: l.createdAt,
        });
      }

      for (const v of await db.select().from(reviewView).orderBy(asc(reviewView.createdAt))) {
        emit("review_view", {
          view_id: v.id,
          episode_id: v.episodeId,
          family_id: v.familyId,
          // "session": one conversation. "linked": a folder's sessions
          // together, in the order things happened.
          kind: v.kind,
          session_id: v.conversationId,
          content: v.content,
          content_hash: v.contentHash,
          created_at: v.createdAt,
        });
      }

      const assignments = await db
        .select()
        .from(reviewAssignment)
        .orderBy(asc(reviewAssignment.reservedAt));
      for (const a of assignments) {
        emit("review_assignment", {
          assignment_id: a.id,
          reviewer_id: a.reviewerId,
          // "primary" (a review) or "pair_audit" (a comparison).
          purpose: a.purpose,
          view_id: a.viewId,
          related_version_id: a.relatedVersionId,
          family_id: a.familyId,
          // "active", "completed", "skipped" or "expired".
          state: a.state,
          slot: a.slot,
          routing: a.routing,
          skip_reason: a.skipReason,
          skip_note: a.skipNote,
          reserved_at: a.reservedAt,
          last_seen_at: a.lastSeenAt,
          finished_at: a.finishedAt,
        });
      }

      for (const r of await db.select().from(reviewResponse).orderBy(asc(reviewResponse.submittedAt))) {
        emit("review_response", {
          id: r.id,
          assignment_id: r.assignmentId,
          view_id: r.viewId,
          reviewer_id: r.reviewerId,
          verdict: r.verdict,
          policy_basis: r.policyBasis,
          confidence: r.confidence,
          evidence_mode: r.evidenceMode,
          evidence_turns: r.evidenceTurns,
          rationale: r.rationale,
          uncertainty_reasons: r.uncertaintyReasons,
          uncertainty_other: r.uncertaintyOther,
          subject_sensitivity: r.subjectSensitivity,
          aim_evidence: r.aimEvidence,
          // Which wording of the review instructions it was made under, and
          // which form. C-1.1 with a policy_basis is the earlier, rule-based
          // instrument; C-2.0 is the shared definition. They are different
          // labelling conditions and should not be pooled.
          review_instruction_version: r.policyVersion,
          policy_version: r.policyVersion,
          form_version: r.formVersion,
          submitted_at: r.submittedAt,
        });
      }

      for (const a of await db.select().from(pairAudit).orderBy(asc(pairAudit.submittedAt))) {
        emit("pair_audit", {
          id: a.id,
          assignment_id: a.assignmentId,
          related_version_id: a.relatedVersionId,
          reviewer_id: a.reviewerId,
          topic_task_match: a.topicTaskMatch,
          scope_similarity: a.scopeSimilarity,
          main_difference: a.mainDifference,
          // The next five were asked by forms before D-2.0.
          sensitivity_match: a.sensitivityMatch,
          intended_change_realized: a.intendedChangeRealized,
          unintended_differences: a.unintendedDifferences,
          unintended_other: a.unintendedOther,
          comparison_type: a.comparisonType,
          audit_note: a.auditNote,
          form_version: a.formVersion,
          submitted_at: a.submittedAt,
        });
      }

      // --- The rest ------------------------------------------------------
      // Copy/paste that was not tied to a session.
      const loose = await db
        .select()
        .from(clipboardEvent)
        .where(isNull(clipboardEvent.conversationId))
        .orderBy(asc(clipboardEvent.createdAt));
      for (const c of loose) {
        emit("clipboard_event", {
          user_id: c.userId,
          kind: c.kind,
          surface: c.surface,
          turn: c.turn,
          role: c.role,
          char_count: c.charCount,
          content: c.content,
          created_at: c.createdAt,
        });
      }

      for (const u of await db.select().from(usageEvent).orderBy(asc(usageEvent.createdAt))) {
        emit("usage_event", {
          user_id: u.userId,
          session_id: u.conversationId,
          message_id: u.messageId,
          kind: u.kind,
          model_id: u.modelId,
          prompt_tokens: u.promptTokens,
          completion_tokens: u.completionTokens,
          cost_usd: u.costUsd,
          created_at: u.createdAt,
        });
      }

      for (const a of await db.select().from(auditEvent).orderBy(asc(auditEvent.createdAt))) {
        emit("audit_event", {
          action: a.action,
          actor_id: a.actorId,
          actor: a.actorLabel,
          target_user_id: a.targetUserId,
          target: a.targetLabel,
          detail: a.detail,
          created_at: a.createdAt,
        });
      }

      // What was collected with the forms used before v1.1. Nothing new is
      // written to these; they are here so that nothing is left behind.
      if (!submittedOnly) {
        for (const l of await db.select().from(transcriptLabels)) {
          emit("legacy_labels", { session_id: l.conversationId, ...l });
        }
        for (const r of await db.select().from(review).orderBy(asc(review.submittedAt))) {
          emit("legacy_review", { session_id: r.conversationId, ...r });
        }
      }

      // --- Nominations: what people wrote up for a prize ------------------
      // In both exports: an entry stands by itself, whatever became of the
      // conversations behind it.
      for (const n of await db.select().from(nomination).orderBy(asc(nomination.submittedAt))) {
        emit("nomination", {
          nomination_id: n.id,
          user_id: n.userId,
          track: n.track,
          headline: n.headline,
          details: n.details,
          slides_url: n.slidesUrl,
          submitted_at: n.submittedAt,
          updated_at: n.updatedAt,
          submission_count: n.submissionCount,
        });
      }

      // The last line, always. A download that is cut short (a timeout, a
      // dropped connection) is otherwise a shorter file that looks whole.
      // No "end" line means the file is not all there.
      controller.enqueue(
        encoder.encode(
          JSON.stringify({
            record: "end",
            counts,
            // Under their older names as well.
            sessions: counts.session ?? 0,
            episodes: counts.episode ?? 0,
            only_submitted: submittedOnly,
          }) + "\n",
        ),
      );

      controller.close();
    },
  });

  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "content-disposition": `attachment; filename="astral-${stamp}.jsonl"`,
    },
  });
}
