import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  conversation,
  judgeRun,
  message,
  nomination,
  profile,
  review,
  submission,
  transcriptLabels,
  user,
} from "@/db/schema";
import { requireAdmin } from "@/lib/gate";

/**
 * The whole dataset as JSONL: one line per submitted transcript.
 *
 * Each line is self-contained, carrying the conversation, every message with
 * the raw request and response from the provider, the author's own labels,
 * the author's profile, any independent review, and any scanner runs. That
 * means a line can be read on its own without joining anything back together
 * later, which is what makes it useful for training and evaluation.
 *
 * Streamed rather than assembled in memory, so the size of the day does not
 * decide whether this works.
 */
export async function GET() {
  await requireAdmin();

  const conversations = await db
    .select()
    .from(conversation)
    .where(eq(conversation.status, "submitted"))
    .orderBy(asc(conversation.createdAt));

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      for (const convo of conversations) {
        const [messages, [labels], [author], [authorProfile], submissions, [theirReview], judgeRuns] =
          await Promise.all([
            db
              .select()
              .from(message)
              .where(eq(message.conversationId, convo.id))
              .orderBy(asc(message.seq)),
            db
              .select()
              .from(transcriptLabels)
              .where(eq(transcriptLabels.conversationId, convo.id)),
            db.select().from(user).where(eq(user.id, convo.userId)),
            db.select().from(profile).where(eq(profile.userId, convo.userId)),
            db
              .select()
              .from(submission)
              .where(eq(submission.conversationId, convo.id))
              .orderBy(asc(submission.version)),
            db.select().from(review).where(eq(review.conversationId, convo.id)),
            db.select().from(judgeRun).where(eq(judgeRun.conversationId, convo.id)),
          ]);

        const line = {
          // Every line says what it is. Without this, transcript lines were
          // unmarked while nomination lines were not, so counting lines
          // overstated the number of transcripts.
          record: "transcript" as const,
          conversation_id: convo.id,
          model_id: convo.modelId,
          scenario: convo.scenario,
          title: convo.title,
          created_at: convo.createdAt,
          submitted_at: convo.lastSubmittedAt,
          version: convo.currentVersion,
          locked_at: convo.lockedAt,
          author: author
            ? {
                id: author.id,
                name: author.name,
                email: author.email,
                profile: authorProfile ?? null,
              }
            : null,
          // The labels as submitted with the current version. The author's
          // working copy can move on afterwards without a new version, so it
          // is given separately rather than passed off as what was submitted.
          self_labels:
            (
              submissions.find((s) => s.version === convo.currentVersion)
                ?.snapshot as { labels?: unknown } | undefined
            )?.labels ?? null,
          draft_labels: labels ?? null,
          independent_review: theirReview ?? null,
          messages: messages.map((m) => ({
            seq: m.seq,
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
        };

        controller.enqueue(encoder.encode(JSON.stringify(line) + "\n"));
      }

      // Nominations do not belong to a transcript, so they come last, each
      // marked so a reader can tell them apart from the transcript lines.
      const nominations = await db
        .select({
          id: nomination.id,
          track: nomination.track,
          headline: nomination.headline,
          details: nomination.details,
          slidesUrl: nomination.slidesUrl,
          collaborators: nomination.collaborators,
          submittedAt: nomination.submittedAt,
          updatedAt: nomination.updatedAt,
          name: user.name,
          email: user.email,
        })
        .from(nomination)
        .innerJoin(user, eq(user.id, nomination.userId));

      for (const entry of nominations) {
        controller.enqueue(
          encoder.encode(JSON.stringify({ record: "nomination", ...entry }) + "\n"),
        );
      }

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
