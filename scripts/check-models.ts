/**
 * Checks models against OpenRouter using your real key.
 *
 *   npm run check-models                       # the live list
 *   npm run check-models -- --fix              # hide failures from participants
 *   npm run check-models -- qwen/qwen3.7-plus  # try candidate ids
 *
 * Each model gets one small request. The report says whether it answered, how
 * long it took, which provider served it, and why it failed if it did.
 *
 * Run it the week of the event and again on the morning: model names and
 * provider availability change, and a model that has gone away is better
 * removed from the list than left for a participant to stumble into.
 *
 * Note on reasoning models: these spend output tokens on hidden reasoning
 * before producing any visible text, so the token budget below is generous.
 * Too small a budget makes a working model look broken.
 */
import { generateText } from "ai";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { eventSettings } from "@/db/schema";
import { getEventSettings, openrouter } from "@/lib/openrouter";
import { DEFAULT_MODELS, type ModelOption } from "@/lib/models";

const args = process.argv.slice(2);
const FIX = args.includes("--fix");
const candidates = args.filter((a) => !a.startsWith("--"));

const MAX_OUTPUT_TOKENS = 512;
const SLOW_MS = 15_000;

type Status = "ok" | "empty" | "fail";
type Check = {
  model: ModelOption;
  status: Status;
  ms: number;
  provider?: string;
  finishReason?: string;
  reasoningTokens?: number;
  detail?: string;
};

async function check(model: ModelOption): Promise<Check> {
  const started = Date.now();
  try {
    const res = await generateText({
      model: openrouter.chat(model.id),
      prompt: "Reply with the single word: ok",
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      timeout: 90_000,
    });
    const meta = res.providerMetadata?.openrouter as { provider?: string } | undefined;
    const text = res.text.trim();
    const reasoningTokens = res.usage?.outputTokenDetails?.reasoningTokens ?? 0;
    return {
      model,
      // Reaching a provider and getting a well-formed response is the thing
      // that matters. Empty text is reported separately rather than as a
      // failure, because it usually means the budget went on reasoning.
      status: text.length > 0 ? "ok" : "empty",
      ms: Date.now() - started,
      provider: meta?.provider,
      finishReason: res.finishReason,
      reasoningTokens,
      detail: text.slice(0, 40),
    };
  } catch (e) {
    const err = e as {
      message?: string;
      statusCode?: number;
      responseBody?: string;
      data?: { error?: { message?: string } };
    };
    let detail = err.data?.error?.message ?? err.message ?? String(e);
    if (!err.data?.error?.message && err.responseBody) {
      try {
        detail = JSON.parse(err.responseBody)?.error?.message ?? detail;
      } catch {
        /* keep what we have */
      }
    }
    return {
      model,
      status: "fail",
      ms: Date.now() - started,
      detail: `${err.statusCode ?? ""} ${detail}`.trim(),
    };
  }
}

async function main() {
  if (!process.env.OPENROUTER_API_KEY) {
    console.error("OPENROUTER_API_KEY is not set in .env.local.");
    process.exit(1);
  }
  if (process.env.OPENROUTER_BASE_URL) {
    console.warn(`Warning: OPENROUTER_BASE_URL is set to ${process.env.OPENROUTER_BASE_URL}.`);
    console.warn("This checks the mock provider, not the real OpenRouter.\n");
  }

  let models: ModelOption[];
  if (candidates.length > 0) {
    models = candidates.map((id, i) => ({
      id,
      displayName: id.split("/").pop() ?? id,
      family: "open" as const,
      sort: i,
      enabled: true,
    }));
  } else {
    const settings = await getEventSettings().catch(() => null);
    models = settings?.enabledModels?.length ? settings.enabledModels : DEFAULT_MODELS;
  }

  console.log(`Checking ${models.length} model(s)...\n`);
  const results = (await Promise.all(models.map(check))).sort(
    (a, b) => a.model.sort - b.model.sort,
  );

  const pad = (s: string, n: number) => s.padEnd(n).slice(0, n);
  for (const r of results) {
    const mark = r.status === "ok" ? "ok  " : r.status === "empty" ? "note" : "FAIL";
    const timing = r.status === "fail" ? "" : `${(r.ms / 1000).toFixed(1)}s`;
    console.log(
      `  ${mark} ${pad(r.model.displayName, 20)} ${pad(r.model.id, 34)} ${pad(timing, 7)} ${
        r.provider ? `via ${r.provider}` : ""
      }`,
    );
    if (r.status === "fail") {
      console.log(`       ${r.detail}`);
    } else if (r.status === "empty") {
      console.log(
        `       Reachable, but returned no visible text (finish: ${r.finishReason}, ` +
          `${r.reasoningTokens} reasoning tokens). Usually a reasoning model that ` +
          `needs a larger reply budget; fine for chat.`,
      );
    }
  }

  const failing = results.filter((r) => r.status === "fail");
  const empty = results.filter((r) => r.status === "empty");
  const slow = results.filter((r) => r.status !== "fail" && r.ms > SLOW_MS);

  console.log("");
  console.log(`  ${results.length - failing.length}/${results.length} reachable.`);
  if (empty.length > 0) {
    console.log(`  Reachable but silent on a short budget: ${empty.map((e) => e.model.displayName).join(", ")}`);
  }
  if (slow.length > 0) {
    console.log(`  Slow (over ${SLOW_MS / 1000}s): ${slow.map((s) => s.model.displayName).join(", ")}`);
  }

  if (candidates.length > 0) {
    console.log("\n  Candidate check only; the stored list was not changed.");
  } else if (failing.length > 0 && FIX) {
    const updated = models.map((m) =>
      failing.some((f) => f.model.id === m.id) ? { ...m, enabled: false } : m,
    );
    await db
      .update(eventSettings)
      .set({ enabledModels: updated, updatedAt: new Date() })
      .where(eq(eventSettings.id, 1));
    console.log(`\n  Disabled ${failing.length} unreachable model(s) for participants.`);
  } else if (failing.length > 0) {
    console.log("  Re-run with --fix to hide the unreachable models from participants.");
  }

  process.exit(failing.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
