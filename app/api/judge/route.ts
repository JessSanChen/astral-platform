import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { judgeConfig, judgeRun } from "@/db/schema";
import { getCurrentUser } from "@/lib/gate";
import { getOwnedConversation } from "@/lib/conversations";
import { ChatError, getEventSettings } from "@/lib/openrouter";
import { finishUsageEvent, releaseSlot, reserveSlot } from "@/lib/budget";
import {
  hashInput,
  isTemporarilyUnavailable,
  listJudgeRuns,
  runJudge,
  transcriptText,
} from "@/lib/judges";

export const maxDuration = 180;

const bodySchema = z.object({
  conversationId: z.string().uuid(),
  judgeConfigId: z.string().uuid(),
});

/** The participant's own judge runs. Nobody can read anyone else's. */
export async function GET() {
  const cu = await getCurrentUser();
  if (!cu) return Response.json({ message: "Unauthorized" }, { status: 401 });
  return Response.json({ runs: await listJudgeRuns(cu.user.id) });
}

export async function POST(req: Request) {
  const cu = await getCurrentUser();
  if (!cu) return Response.json({ message: "Please sign in again." }, { status: 401 });
  if (cu.user.banned)
    return Response.json({ message: "An organizer has paused your account." }, { status: 403 });
  if (cu.needsProfile || cu.needsTerms)
    return Response.json({ message: "Finish your profile first." }, { status: 403 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success)
    return Response.json({ message: "Invalid request." }, { status: 400 });
  const { conversationId, judgeConfigId } = parsed.data;

  let convo;
  try {
    convo = await getOwnedConversation(conversationId, cu.user.id);
  } catch (e) {
    if (e instanceof ChatError)
      return Response.json({ message: e.message }, { status: 404 });
    throw e;
  }

  const [settings, [config]] = await Promise.all([
    getEventSettings(),
    db.select().from(judgeConfig).where(eq(judgeConfig.id, judgeConfigId)),
  ]);
  if (!config || !config.enabled)
    return Response.json({ message: "That scanner is not available." }, { status: 400 });

  // Read the transcript before claiming a run, so asking a scanner about an
  // empty conversation is refused without costing one of the hour's runs.
  const { text: transcript, turns, turnCount } = await transcriptText(
    conversationId,
    convo.scenario,
  );
  if (!transcript.trim())
    return Response.json({ message: "Have a conversation first." }, { status: 400 });

  // Judges are a learning aid, not the point of the event, and each run costs
  // a model call. The hourly limit keeps that in proportion.
  const limit = cu.user.judgeRunsPerHour ?? settings.defaultJudgeRunsPerHour;
  const usageEventId = await reserveSlot({
    userId: cu.user.id,
    conversationId,
    kind: "judge",
    modelId: config.modelId,
    limit,
    windowSeconds: 3600,
  });
  if (!usageEventId)
    return Response.json(
      {
        message: `You have used all ${limit} scanner runs for this hour. Keep chatting and try again later.`,
      },
      { status: 429 },
    );

  try {
    const { verdict, raw, parsed: parsedOutput, usage } = await runJudge(
      config,
      transcript,
      turns,
    );
    const [saved] = await db
      .insert(judgeRun)
      .values({
        conversationId,
        userId: cu.user.id,
        judgeConfigId,
        inputHash: hashInput(transcript, judgeConfigId),
        turnCount,
        rawOutput: raw,
        parsed: { ...(parsedOutput as object | null), verdict },
        verdict: verdict.headline,
        status: "ok",
      })
      .returning();
    await finishUsageEvent(usageEventId, {
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      costUsd: usage.costUsd,
    });
    return Response.json({
      run: {
        id: saved.id,
        conversationId,
        judgeConfigId,
        judgeName: config.name,
        turnCount,
        verdict: verdict.headline,
        parsed: { verdict },
        status: "ok",
        createdAt: saved.createdAt,
      },
    });
  } catch (e) {
    const err = e as { message?: string; statusCode?: number; responseBody?: string };
    let detail = err.message ?? String(e);
    if (err.responseBody) {
      try {
        detail = JSON.parse(err.responseBody)?.error?.message ?? detail;
      } catch {
        /* keep what we have */
      }
    }
    console.error("[judge] failed", { judgeConfigId, modelId: config.modelId, detail });

    // A busy provider is a queue, not a result. Nothing is recorded, so the
    // participant can simply run it again in a moment and get a real verdict
    // rather than a stored failure sitting in their list.
    if (isTemporarilyUnavailable(e)) {
      // Give the hourly allowance back: a request that never reached a model
      // should not count against the participant.
      await releaseSlot(usageEventId);
      return Response.json(
        {
          message: `${config.name} is busy upstream right now. Nothing was recorded; try again in a few moments. The other scanner is served separately and should still work.`,
        },
        { status: 503 },
      );
    }

    await db.insert(judgeRun).values({
      conversationId,
      userId: cu.user.id,
      judgeConfigId,
      inputHash: hashInput(transcript, judgeConfigId),
      turnCount,
      rawOutput: null,
      parsed: { error: detail },
      verdict: "Scanner failed",
      status: "error",
    });
    return Response.json(
      { message: `That scanner could not run: ${detail}` },
      { status: 502 },
    );
  }
}
