/**
 * Checks every model in the live list against OpenRouter, using your real key.
 *
 *   npx tsx --env-file=.env.local scripts/check-models.ts
 *
 * For each model it sends one tiny request and reports whether it answered,
 * how long the first reply took, and the provider that served it. Run this
 * the week of the event: provider availability and model names change, and a
 * model that has gone away shows up here as a clear failure rather than as a
 * participant staring at an error.
 *
 * Add --fix to disable the failing models in the database so participants
 * only ever see models that currently work.
 */
import { generateText } from "ai";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { eventSettings } from "@/db/schema";
import { getEventSettings, openrouter } from "@/lib/openrouter";
import { DEFAULT_MODELS, type ModelOption } from "@/lib/models";

const FIX = process.argv.includes("--fix");

type Check = {
  model: ModelOption;
  ok: boolean;
  ms: number;
  provider?: string;
  detail?: string;
};

async function check(model: ModelOption): Promise<Check> {
  const started = Date.now();
  try {
    const res = await generateText({
      model: openrouter.chat(model.id),
      prompt: "Reply with the single word: ok",
      maxOutputTokens: 16,
      timeout: 60_000,
    });
    const meta = res.providerMetadata?.openrouter as { provider?: string } | undefined;
    return {
      model,
      ok: res.text.trim().length > 0,
      ms: Date.now() - started,
      provider: meta?.provider,
      detail: res.text.trim().slice(0, 40),
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
        /* keep the message we have */
      }
    }
    return {
      model,
      ok: false,
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
    console.warn(
      `Warning: OPENROUTER_BASE_URL is set to ${process.env.OPENROUTER_BASE_URL}.`,
    );
    console.warn("This checks the mock provider, not the real OpenRouter.\n");
  }

  const settings = await getEventSettings().catch(() => null);
  const models = settings?.enabledModels?.length
    ? settings.enabledModels
    : DEFAULT_MODELS;

  console.log(`Checking ${models.length} models...\n`);
  const results = await Promise.all(models.map(check));

  const pad = (s: string, n: number) => s.padEnd(n).slice(0, n);
  for (const r of results.sort((a, b) => a.model.sort - b.model.sort)) {
    const mark = r.ok ? "ok  " : "FAIL";
    const timing = r.ok ? `${(r.ms / 1000).toFixed(1)}s` : "";
    const via = r.provider ? `via ${r.provider}` : "";
    console.log(
      `  ${mark} ${pad(r.model.displayName, 20)} ${pad(r.model.id, 34)} ${pad(timing, 7)} ${via}`,
    );
    if (!r.ok) console.log(`       ${r.detail}`);
  }

  const failing = results.filter((r) => !r.ok);
  const slow = results.filter((r) => r.ok && r.ms > 15_000);
  console.log("");
  console.log(`  ${results.length - failing.length}/${results.length} models answered.`);
  if (slow.length > 0) {
    console.log(
      `  Slow (over 15s for a one-word reply): ${slow.map((s) => s.model.displayName).join(", ")}`,
    );
  }

  if (failing.length > 0 && FIX) {
    const updated = models.map((m) =>
      failing.some((f) => f.model.id === m.id) ? { ...m, enabled: false } : m,
    );
    await db
      .update(eventSettings)
      .set({ enabledModels: updated, updatedAt: new Date() })
      .where(eq(eventSettings.id, 1));
    console.log(`\n  Disabled ${failing.length} failing model(s) for participants.`);
  } else if (failing.length > 0) {
    console.log("  Re-run with --fix to hide the failing models from participants.");
  }

  process.exit(failing.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
