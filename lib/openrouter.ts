import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { eventSettings } from "@/db/schema";
import { DEFAULT_MODELS, type ModelOption } from "@/lib/models";
import { CACHE_KEYS, SETTINGS_TTL_MS, cached } from "@/lib/cache";

export const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
  // Local testing only: point at a mock that speaks OpenRouter's protocol.
  // Leave unset everywhere else so the real API is used.
  ...(process.env.OPENROUTER_BASE_URL
    ? { baseURL: process.env.OPENROUTER_BASE_URL }
    : {}),
  // 'strict' is correct when talking to OpenRouter itself.
  compatibility: "strict",
  appName: "Astral",
  appUrl: process.env.BETTER_AUTH_URL,
  // Ask OpenRouter to return token counts and cost on every response so we
  // can bill budgets accurately instead of estimating.
  extraBody: { usage: { include: true } },
});

export type EventSettings = {
  eventCode: string;
  defaultDailyTokenBudget: number;
  defaultJudgeRunsPerHour: number;
  chatRequestsPerMinute: number;
  reviewBatchSize: number;
  maxReviewsPerTranscript: number;
  nominationsCloseAt: Date | null;
  nominationsLocked: boolean;
  chatPaused: boolean;
  allowModelFallback: boolean;
  enabledModels: ModelOption[];
};

/**
 * Reads the singleton settings row, falling back to code defaults.
 *
 * Cached briefly: this is read on every page load and every message, but
 * changes only when an admin edits it. The limits it carries are compared
 * against live counts, so a few seconds of staleness cannot let anyone
 * exceed a budget.
 */
export async function getEventSettings(): Promise<EventSettings> {
  return cached(CACHE_KEYS.eventSettings, SETTINGS_TTL_MS, loadEventSettings);
}

async function loadEventSettings(): Promise<EventSettings> {
  const [row] = await db
    .select()
    .from(eventSettings)
    .where(eq(eventSettings.id, 1));
  const models = (row?.enabledModels as ModelOption[] | undefined) ?? DEFAULT_MODELS;
  return {
    eventCode: row?.eventCode ?? process.env.EVENT_CODE ?? "",
    defaultDailyTokenBudget: row?.defaultDailyTokenBudget ?? 5_000_000,
    defaultJudgeRunsPerHour: row?.defaultJudgeRunsPerHour ?? 40,
    chatRequestsPerMinute: row?.chatRequestsPerMinute ?? 20,
    reviewBatchSize: row?.reviewBatchSize ?? 5,
    maxReviewsPerTranscript: row?.maxReviewsPerTranscript ?? 2,
    nominationsCloseAt: row?.nominationsCloseAt ?? null,
    nominationsLocked: row?.nominationsLocked ?? false,
    chatPaused: row?.chatPaused ?? false,
    allowModelFallback: row?.allowModelFallback ?? false,
    enabledModels: models.filter((m) => m.enabled !== false),
  };
}

/** Guards against a client asking for a model the admin has not enabled. */
export function assertModelAllowed(modelId: string, models: ModelOption[]) {
  const match = models.find((m) => m.id === modelId);
  if (!match) {
    throw new ChatError("model_not_allowed", "That model is not available.");
  }
  return match;
}

export class ChatError extends Error {
  constructor(
    public code:
      | "model_not_allowed"
      | "chat_paused"
      | "account_paused"
      | "rate_limited"
      | "budget_exhausted"
      | "not_found"
      | "forbidden",
    message: string,
  ) {
    super(message);
  }
}
