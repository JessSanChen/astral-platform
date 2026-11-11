import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { after } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { message as messageTable } from "@/db/schema";
import {
  ChatError,
  assertModelAllowed,
  getEventSettings,
  openrouter,
} from "@/lib/openrouter";
import { finishUsageEvent, reserveSlot, tokensUsedToday } from "@/lib/budget";
import {
  appendMessage,
  setDerivedTitle,
  getOwnedConversation,
  getVisibleMessages,
  touchConversation,
} from "@/lib/conversations";
import { getCurrentUser, whyBlocked } from "@/lib/gate";
import { buildPrompt } from "@/lib/prompt";

// Long generations need more than the default; Vercel Pro allows up to 800s.
export const maxDuration = 300;

function fail(code: string, message: string, status: number) {
  return Response.json({ code, message }, { status });
}

/**
 * Pulls something useful out of a provider failure. OpenRouter reports a bad
 * model id, an unavailable model and a content filter all as API errors with
 * the detail in the response body, so that body is what we keep and show.
 */
function describeProviderError(error: unknown): {
  message: string;
  status?: number;
  body?: unknown;
} {
  const e = error as {
    message?: string;
    statusCode?: number;
    responseBody?: unknown;
    data?: { error?: { message?: string } };
    cause?: { message?: string };
  };
  const providerMessage =
    e?.data?.error?.message ??
    (typeof e?.responseBody === "string"
      ? safeJsonMessage(e.responseBody)
      : undefined);
  const base =
    providerMessage ?? e?.message ?? e?.cause?.message ?? "Unknown provider error";
  return {
    message: base,
    status: e?.statusCode,
    body: e?.responseBody ?? null,
  };
}

function safeJsonMessage(raw: string): string | undefined {
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: string } };
    return parsed?.error?.message;
  } catch {
    return raw.slice(0, 300) || undefined;
  }
}

export async function POST(req: Request) {
  const cu = await getCurrentUser();
  if (!cu) return fail("unauthorized", "Please sign in again.", 401);
  const blocked = whyBlocked(cu);
  if (blocked) return fail(blocked.code, blocked.message, 403);

  const body = (await req.json().catch(() => ({}))) as {
    conversationId?: string;
    messages?: UIMessage[];
    regenerate?: boolean;
  };
  const { conversationId, messages: uiMessages = [], regenerate = false } = body;
  if (!conversationId) return fail("bad_request", "Missing conversation.", 400);

  // Read the new message before anything is claimed on the participant's
  // behalf, so a request that is going to be refused for being empty does
  // not first use up one of their sends for the minute.
  const incoming = uiMessages[uiMessages.length - 1];
  const text = regenerate
    ? ""
    : (incoming?.parts
        ?.filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => p.text)
        .join("") ?? "");
  if (!regenerate && !text.trim())
    return fail("bad_request", "Message is empty.", 400);

  // Fetched together: none of these depend on each other, and every round
  // trip here delays the first token the participant sees.
  const [settings, convoResult, used] = await Promise.all([
    getEventSettings(),
    getOwnedConversation(conversationId, cu.user.id).then(
      (value) => ({ ok: true as const, value }),
      (error: unknown) => ({ ok: false as const, error }),
    ),
    tokensUsedToday(cu.user.id),
  ]);

  if (settings.chatPaused)
    return fail("chat_paused", "An organizer has paused chat for everyone.", 503);

  if (!convoResult.ok) {
    const e = convoResult.error;
    if (e instanceof ChatError)
      return fail(e.code, e.message, e.code === "not_found" ? 404 : 403);
    throw e;
  }
  const convo = convoResult.value;

  // A transcript another participant has already reviewed is fixed: their
  // judgement describes it as it stood when they read it.
  if (convo.lockedAt)
    return fail(
      "locked",
      "This transcript has been independently reviewed, so it can no longer be changed. Start a new conversation to keep exploring.",
      409,
    );

  try {
    assertModelAllowed(convo.modelId, settings.enabledModels);
  } catch (e) {
    if (e instanceof ChatError) return fail(e.code, e.message, 403);
    throw e;
  }

  // --- Budget and rate limit -------------------------------------------
  const budget = cu.user.dailyTokenBudget ?? settings.defaultDailyTokenBudget;
  if (used >= budget)
    return fail("budget_exhausted", "You have reached today's usage limit. Find an organizer to raise it.", 429);

  // Claims a slot and records the request in one step, so simultaneous
  // requests cannot all slip past the same stale count.
  const usageEventId = await reserveSlot({
    userId: cu.user.id,
    conversationId,
    kind: "chat",
    modelId: convo.modelId,
    limit: settings.chatRequestsPerMinute,
    windowSeconds: 60,
  });
  if (!usageEventId)
    return fail("rate_limited", "You are sending messages very quickly. Wait a few seconds.", 429);

  // --- Persist the incoming user message (or supersede on regenerate) ---
  const history = await getVisibleMessages(conversationId);
  const last = history[history.length - 1];
  // Built from what the database returned plus the row we write below, so the
  // prompt still never comes from client input, without reading the same
  // messages a second time.
  let promptHistory = history;

  if (regenerate) {
    // Hide the previous assistant reply; it stays in the database.
    if (last?.role === "assistant") {
      await db
        .update(messageTable)
        .set({ supersededBy: last.id })
        .where(eq(messageTable.id, last.id));
      promptHistory = history.slice(0, -1);
    }
  } else {
    const savedUserMessage = await appendMessage({
      conversationId,
      role: "user",
      content: text,
      parts: incoming?.parts ?? null,
    });
    promptHistory = [...history, savedUserMessage];
    if (history.length === 0) {
      await setDerivedTitle(conversationId, text);
    } else {
      await touchConversation(conversationId);
    }
  }

  // Empty replies are left out and same-speaker neighbours joined, so the
  // provider always gets non-empty, alternating turns. See lib/prompt.ts.
  const modelMessages = await convertToModelMessages(
    buildPrompt(promptHistory).map((turn) => ({
      role: turn.role,
      parts: [{ type: "text" as const, text: turn.text }],
    })),
  );

  const startedAt = Date.now();

  const result = streamText({
    model: openrouter.chat(convo.modelId),
    system: convo.scenario ?? undefined,
    messages: modelMessages,
    // Retaining the request body and messages is off by default. The research
    // dataset needs the exact payload sent to the provider, so opt in.
    include: { requestBody: true, requestMessages: true },
    onAbort: async ({ steps }) => {
      // Reached only if generation really is cut short. Keep whatever text
      // arrived rather than discarding the turn.
      const text = steps.map((st) => st.text ?? "").join("");
      console.warn("[chat] generation aborted", { conversationId, chars: text.length });
      await appendMessage({
        conversationId,
        role: "assistant",
        content: text,
        parts: [{ type: "text", text }],
        modelId: convo.modelId,
        finishReason: "aborted",
        latencyMs: Date.now() - startedAt,
      });
      await touchConversation(conversationId);
    },
    onError: async ({ error }) => {
      // An API-level refusal produces no visible text but is still a refusal
      // worth keeping, so record it as a message with an error payload.
      const detail = describeProviderError(error);
      console.error("[chat] provider error", {
        conversationId,
        modelId: convo.modelId,
        status: detail.status,
        message: detail.message,
        body: detail.body,
      });
      await appendMessage({
        conversationId,
        role: "assistant",
        content: "",
        modelId: convo.modelId,
        finishReason: "error",
        error: detail,
        latencyMs: Date.now() - startedAt,
      });
      await touchConversation(conversationId);
    },
    onFinish: async (event) => {
      const meta = event.providerMetadata?.openrouter as
        | { provider?: string; usage?: { cost?: number } }
        | undefined;
      const promptTokens = event.totalUsage?.inputTokens ?? 0;
      const completionTokens = event.totalUsage?.outputTokens ?? 0;
      const reasoningTokens =
        event.totalUsage?.outputTokenDetails?.reasoningTokens ?? null;
      const cost = meta?.usage?.cost ?? null;

      const saved = await appendMessage({
          conversationId,
          role: "assistant",
          content: event.text ?? "",
          parts: [{ type: "text", text: event.text ?? "" }],
          modelId: convo.modelId,
          provider: meta?.provider ?? null,
          generationId: event.response?.id ?? null,
          finishReason: event.finishReason ?? null,
          promptTokens,
          completionTokens,
          reasoningTokens,
          costUsd: cost,
          latencyMs: Date.now() - startedAt,
          rawRequest:
            (event.request?.body as object | undefined) ??
            (event.request?.messages
              ? { messages: event.request.messages }
              : null),
          // A streamed reply has no single response body (it arrives as SSE
          // chunks), so store the assembled response metadata instead: the
          // generation id, the provider that actually served it, the model
          // variant, headers, finish reasons and the provider's own usage
          // accounting including cost.
          rawResponse: {
            id: event.response?.id ?? null,
            modelId: event.response?.modelId ?? null,
            timestamp: event.response?.timestamp ?? null,
            headers: event.response?.headers ?? null,
            finishReason: event.finishReason ?? null,
            rawFinishReason: event.rawFinishReason ?? null,
            usage: event.totalUsage ?? null,
            providerMetadata: event.providerMetadata ?? null,
            streamed: true,
          },
        });

      await finishUsageEvent(usageEventId, {
        messageId: saved?.id,
        promptTokens,
        completionTokens,
        costUsd: cost,
      });
      await touchConversation(conversationId);
    },
  });

  // Keep reading the model's output on the server even if the browser goes
  // away, which happens whenever a participant switches conversations while
  // a reply is still arriving. Without this the generation is abandoned
  // mid-flight and the reply is lost; with it the reply finishes and is
  // saved, so it is simply there when they come back.
  const consumed = result.consumeStream();
  // Reading is not enough on its own where the host stops a function once
  // its response has ended, which a closed tab ends early. `after` tells the
  // host there is still work in hand, so the function is kept until the
  // reply has been read to the end and saved, within maxDuration.
  after(async () => {
    await consumed;
  });

  // Pass the provider's own wording through to the participant. Without this
  // every failure reads as a generic "something went wrong", which gives
  // neither the participant nor an organizer anything to act on.
  return result.toUIMessageStreamResponse({
    onError: (error) => describeProviderError(error).message,
  });
}
