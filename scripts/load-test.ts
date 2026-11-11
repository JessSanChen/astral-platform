/**
 * Simulates many participants chatting at once.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/load-test.ts [users] [turns] [baseUrl]
 *
 * Each simulated user signs up, completes onboarding directly in the
 * database (the form is covered by the browser tests), opens a conversation
 * and sends `turns` messages, waiting for each reply before the next.
 *
 * Point OPENROUTER_BASE_URL at the mock server for a free run, or leave it
 * unset to exercise real models, which costs real credits.
 */
import { db } from "@/db";
import { conversation, message, profile, usageEvent, user as userTable } from "@/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";

const USERS = Number(process.argv[2] ?? 20);
const TURNS = Number(process.argv[3] ?? 3);
const BASE = process.argv[4] ?? "http://localhost:3000";
const MODEL = process.env.LOAD_TEST_MODEL ?? "openai/gpt-5";

type Result = {
  email: string;
  ok: boolean;
  replies: number;
  errors: string[];
  latencies: number[];
};

// Different on every run, so a second run does not collide with the accounts
// the first one left behind and report seventy failed sign-ups.
const RUN = Date.now().toString(36);

async function runUser(n: number): Promise<Result> {
  const email = `load-${RUN}-${n}@example.test`;
  const res: Result = { email, ok: false, replies: 0, errors: [], latencies: [] };
  const jar: string[] = [];
  // Better Auth rejects requests whose Origin does not match the configured
  // URL, which is the cross-site protection browsers rely on. A non-browser
  // client has to send it explicitly.
  const headers = () => ({
    "content-type": "application/json",
    origin: BASE,
    cookie: jar.join("; "),
  });
  const capture = (r: Response) => {
    const set = r.headers.getSetCookie?.() ?? [];
    for (const c of set) jar.push(c.split(";")[0]);
  };

  const signUp = await fetch(`${BASE}/api/auth/sign-up/email`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: BASE,
      // The server refuses a sign-up without the event code.
      "x-event-code": process.env.EVENT_CODE ?? "",
    },
    body: JSON.stringify({ name: `Load ${n}`, email, password: "river-stone-4821" }),
  });
  if (!signUp.ok) {
    res.errors.push(`signup ${signUp.status}`);
    return res;
  }
  capture(signUp);

  // Complete onboarding directly; the UI path is covered elsewhere.
  const [u] = await db.select().from(userTable).where(eq(userTable.email, email));
  await db
    .update(userTable)
    .set({ profileCompletedAt: new Date(), termsVersion: 1, termsAcceptedAt: new Date() })
    .where(eq(userTable.id, u.id));
  await db
    .insert(profile)
    .values({
      userId: u.id,
      affiliation: "Load Test U",
      role: "Graduate student",
      highestDegree: "MS",
      yearsExperience: "2-4",
      primaryBackground: "Life sciences",
      aiFamiliarity: "Regular user",
    })
    .onConflictDoNothing();

  const convRes = await fetch(`${BASE}/api/conversations`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ modelId: MODEL, scenario: "Load test scenario." }),
  });
  if (!convRes.ok) {
    res.errors.push(`conversation ${convRes.status}`);
    return res;
  }
  const { id: conversationId } = (await convRes.json()) as { id: string };

  for (let t = 0; t < TURNS; t++) {
    const started = Date.now();
    const chat = await fetch(`${BASE}/api/chat`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        conversationId,
        messages: [
          { id: `m${t}`, role: "user", parts: [{ type: "text", text: `Load message ${t}` }] },
        ],
      }),
    });
    if (!chat.ok) {
      res.errors.push(`chat ${chat.status}`);
      continue;
    }
    // Drain the stream so the server reaches its completion handler.
    await chat.text();
    res.latencies.push(Date.now() - started);
    res.replies++;
  }
  res.ok = res.errors.length === 0;
  return res;
}

function percentile(values: number[], p: number) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

async function main() {
  console.log(`Load test: ${USERS} users x ${TURNS} turns against ${BASE}`);
  const started = Date.now();
  const results = await Promise.all(
    Array.from({ length: USERS }, (_, i) => runUser(i)),
  );
  const elapsed = (Date.now() - started) / 1000;

  const latencies = results.flatMap((r) => r.latencies);
  const failed = results.filter((r) => !r.ok);
  const expectedReplies = USERS * TURNS;
  const actualReplies = results.reduce((a, r) => a + r.replies, 0);

  // Confirm the database agrees with what the clients saw.
  const emails = results.map((r) => r.email);
  const ids = (
    await db.select({ id: userTable.id }).from(userTable).where(inArray(userTable.email, emails))
  ).map((r) => r.id);
  const [{ assistants }] = await db
    .select({ assistants: sql<number>`count(*)::int` })
    .from(message)
    .innerJoin(conversation, eq(message.conversationId, conversation.id))
    .where(and(inArray(conversation.userId, ids), eq(message.role, "assistant")));
  const [{ events, tokens }] = await db
    .select({
      events: sql<number>`count(*)::int`,
      tokens: sql<number>`coalesce(sum(${usageEvent.promptTokens} + ${usageEvent.completionTokens}),0)::int`,
    })
    .from(usageEvent)
    .where(inArray(usageEvent.userId, ids));

  console.log("");
  console.log(`  wall clock        ${elapsed.toFixed(1)}s`);
  console.log(`  replies           ${actualReplies}/${expectedReplies}`);
  console.log(`  users with errors ${failed.length}/${USERS}`);
  console.log(`  latency p50       ${percentile(latencies, 50)}ms`);
  console.log(`  latency p95       ${percentile(latencies, 95)}ms`);
  console.log(`  latency max       ${Math.max(0, ...latencies)}ms`);
  console.log(`  assistant rows    ${assistants}`);
  console.log(`  usage events      ${events} (${tokens} tokens)`);
  if (failed.length > 0) {
    console.log("");
    console.log("  first errors:");
    for (const f of failed.slice(0, 5)) console.log(`    ${f.email}: ${f.errors.join(", ")}`);
  }
  process.exit(failed.length === 0 && assistants === expectedReplies ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
