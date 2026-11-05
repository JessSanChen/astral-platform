/**
 * Checks that the platform is actually able to work, end to end, using your
 * real database and your real OpenRouter key.
 *
 *   npm run doctor
 *
 * It reports on the database connection and its round-trip time, whether the
 * schema is up to date, whether every chat model answers, and whether every
 * scanner runs and stores a result. Run it after pulling changes, and again
 * on the morning of the event.
 */
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { generateText } from "ai";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { conversation, judgeConfig, judgeRun, message, user } from "@/db/schema";
import { getEventSettings, openrouter } from "@/lib/openrouter";
import { runJudge } from "@/lib/judges";

let failures = 0;
const ok = (m: string) => console.log(`  ok    ${m}`);
const warn = (m: string) => console.log(`  note  ${m}`);
const bad = (m: string) => {
  failures++;
  console.log(`  FAIL  ${m}`);
};

function reason(e: unknown) {
  const err = e as {
    message?: string;
    statusCode?: number;
    responseBody?: string;
    cause?: { message?: string };
  };
  let detail = err.message ?? String(e);
  if (err.responseBody) {
    try {
      detail = JSON.parse(err.responseBody)?.error?.message ?? detail;
    } catch {
      /* keep what we have */
    }
  }
  // Database errors arrive with the whole failed statement attached, which
  // buries the part that says what is wrong.
  if (err.cause?.message) detail = err.cause.message;
  detail = detail.split("\n")[0];
  if (detail.length > 160) detail = detail.slice(0, 157) + "...";
  return `${err.statusCode ?? ""} ${detail}`.trim();
}

async function checkDatabase() {
  console.log("\nDatabase");
  try {
    const started = Date.now();
    await db.execute(sql`select 1`);
    ok(`connected in ${Date.now() - started}ms`);
  } catch (e) {
    bad(`cannot connect: ${reason(e)}`);
    return false;
  }

  // Round-trip time, which is what makes the interface feel fast or slow.
  const samples: number[] = [];
  for (let i = 0; i < 10; i++) {
    const t = Date.now();
    await db.execute(sql`select 1`);
    samples.push(Date.now() - t);
  }
  samples.sort((a, b) => a - b);
  const median = samples[Math.floor(samples.length / 2)];
  const line = `round trip median ${median}ms (fastest ${samples[0]}, slowest ${samples[samples.length - 1]})`;
  if (median <= 15) ok(line);
  else if (median <= 50) warn(`${line} — fine, but a closer region would feel snappier`);
  else bad(`${line} — this is what makes the interface feel slow; move the database nearer`);

  return true;
}

async function checkSchema() {
  console.log("\nSchema");
  const files = readdirSync(join(process.cwd(), "db", "migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort();
  let applied = 0;
  try {
    const rows = await db.execute<{ count: number }>(
      sql`select count(*)::int as count from drizzle.__drizzle_migrations`,
    );
    applied = Number((rows as unknown as { count: number }[])[0]?.count ?? 0);
  } catch {
    bad("no migrations have ever been applied. Run: npm run db:migrate");
    return;
  }
  if (applied < files.length) {
    bad(
      `${applied} of ${files.length} migrations applied. Run: npm run db:migrate`,
    );
  } else {
    ok(`${applied} migrations applied`);
  }

  // Prove the tables the app writes to actually accept what it writes.
  for (const [table, column] of [
    ["judge_run", "turn_count"],
    ["message", "raw_request"],
    ["conversation", "scenario"],
  ] as const) {
    const rows = await db.execute(
      sql`select 1 from information_schema.columns where table_name = ${table} and column_name = ${column}`,
    );
    const found = (rows as unknown as unknown[]).length > 0;
    if (found) ok(`${table}.${column} present`);
    else bad(`${table}.${column} missing. Run: npm run db:migrate`);
  }
}

async function checkModels() {
  console.log("\nChat models");
  if (!process.env.OPENROUTER_API_KEY) {
    bad("OPENROUTER_API_KEY is not set in .env.local");
    return;
  }
  if (process.env.OPENROUTER_BASE_URL) {
    warn(`OPENROUTER_BASE_URL is set to ${process.env.OPENROUTER_BASE_URL}`);
    warn("That is the stand-in provider, not the real OpenRouter.");
  }
  const settings = await getEventSettings();
  if (settings.enabledModels.length === 0) {
    bad("no models are enabled. Run: npm run db:seed -- --models");
    return;
  }
  const results = await Promise.all(
    settings.enabledModels.map(async (m) => {
      const started = Date.now();
      try {
        const res = await generateText({
          model: openrouter.chat(m.id),
          prompt: "Reply with the single word: ok",
          maxOutputTokens: 512,
          timeout: 90_000,
        });
        return { m, ok: true, ms: Date.now() - started, text: res.text.trim() };
      } catch (e) {
        return { m, ok: false, ms: Date.now() - started, text: reason(e) };
      }
    }),
  );
  for (const r of results) {
    if (r.ok) ok(`${r.m.displayName} answered in ${(r.ms / 1000).toFixed(1)}s`);
    else bad(`${r.m.displayName} (${r.m.id}): ${r.text}`);
  }
}

async function checkScanners() {
  console.log("\nScanners");
  const configs = await db
    .select()
    .from(judgeConfig)
    .where(eq(judgeConfig.enabled, true));
  if (configs.length === 0) {
    bad("no scanners configured. Run: npm run db:seed");
    return;
  }
  const transcript =
    "[1] User: What is covid-19?\n\n[2] Assistant: It is a respiratory illness caused by SARS-CoV-2.";
  for (const config of configs) {
    try {
      const res = await runJudge(config, transcript, [
        { role: "user", content: "What is covid-19?" },
        {
          role: "assistant",
          content: "It is a respiratory illness caused by SARS-CoV-2.",
        },
      ]);
      ok(`${config.name}: ${res.verdict.headline}`);
    } catch (e) {
      bad(`${config.name} (${config.modelId}): ${reason(e)}`);
    }
  }
}

/** Writes and removes one row of each kind, to prove the app can save its work. */
async function checkWrites() {
  console.log("\nSaving");
  const [anyUser] = await db.select().from(user).limit(1);
  if (!anyUser) {
    warn("no accounts yet, so write checks were skipped");
    return;
  }
  const [convo] = await db
    .insert(conversation)
    .values({ userId: anyUser.id, modelId: "doctor/check", title: "doctor check" })
    .returning();
  try {
    await db.insert(message).values({
      conversationId: convo.id,
      seq: 1,
      role: "user",
      content: "doctor check",
      rawRequest: { check: true },
    });
    ok("messages can be saved");
    const [config] = await db.select().from(judgeConfig).limit(1);
    if (config) {
      await db.insert(judgeRun).values({
        conversationId: convo.id,
        userId: anyUser.id,
        judgeConfigId: config.id,
        turnCount: 1,
        verdict: "doctor check",
        status: "ok",
      });
      ok("scanner results can be saved");
    }
  } catch (e) {
    bad(`cannot save: ${reason(e)}`);
  } finally {
    await db.delete(conversation).where(eq(conversation.id, convo.id));
  }
}

async function main() {
  console.log("Astral doctor");
  const connected = await checkDatabase();
  if (connected) {
    await checkSchema();
    await checkWrites();
  }
  await checkModels();
  await checkScanners();

  console.log("");
  if (failures === 0) console.log("Everything checks out.");
  else console.log(`${failures} problem(s) found. Each line above says what to do.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
