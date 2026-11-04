import { convertToModelMessages, streamText, type UIMessage } from "ai";
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
  deriveTitle,
  getOwnedConversation,
  getVisibleMessages,
  touchConversation,
} from "@/lib/conversations";
import { getCurrentUser } from "@/lib/gate";

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
  if (cu.user.banned)
    return fail("account_paused", "An organizer has paused your account.", 403);
  if (cu.needsProfile || cu.needsTerms)
    return fail("onboarding", "Finish your profile first.", 403);

  const body = (await req.json()) as {
    conversationId?: string;
    messages?: UIMessage[];
    regenerate?: boolean;
  };
  const { conversationId, messages: uiMessages = [], regenerate = false } = body;
  if (!conversationId) return fail("bad_request", "Missing conversation.", 400);

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
    const incoming = uiMessages[uiMessages.length - 1];
    const text =
      incoming?.parts
        ?.filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => p.text)
        .join("") ?? "";
    if (!text.trim()) return fail("bad_request", "Message is empty.", 400);

    const savedUserMessage = await appendMessage({
      conversationId,
      role: "user",
      content: text,
      parts: incoming?.parts ?? null,
    });
    promptHistory = [...history, savedUserMessage];
    if (history.length === 0) {
      await touchConversation(conversationId, { title: deriveTitle(text) });
    } else {
      await touchConversation(conversationId);
    }
  }

  const modelMessages = await convertToModelMessages(
    promptHistory.map((m) => ({
      role: m.role,
      parts: (m.parts as UIMessage["parts"]) ?? [{ type: "text", text: m.content }],
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

  // Pass the provider's own wording through to the participant. Without this
  // every failure reads as a generic "something went wrong", which gives
  // neither the participant nor an organizer anything to act on.
  return result.toUIMessageStreamResponse({
    onError: (error) => describeProviderError(error).message,
  });
}
