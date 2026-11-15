/**
 * Simulates many participants chatting at once.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/load-test.ts [users] [turns] [baseUrl]
 *
 * Each simulated user signs up, completes onboarding directly in the
 * database (the form is covered by the browser tests), opens a conversation,
 * sends `turns` messages, waiting for each reply before the next, and then
 * submits it, which is the step that freezes the record and writes out what
 * reviewers will be shown.
 *
 * Reviewing is not simulated. It goes through server actions, which have no
 * stable address to post to from outside a browser; the browser tests cover
 * it.
 *
 * Point OPENROUTER_BASE_URL at the mock server for a free run, or leave it
 * unset to exercise real models, which costs real credits.
 */
import { DEFAULT_MODELS } from "@/lib/models";
import { db } from "@/db";
import {
  conversation,
  episode,
  message,
  profile,
  reviewView,
  usageEvent,
  user as userTable,
} from "@/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { PROVENANCE_VALUES } from "@/lib/episode-options";
import { submitEpisode } from "@/lib/episodes";
import { INTAKE_VERSION, WORK_AREAS, intakeSchema } from "@/lib/intake";

// The shortest set of intake answers the form would accept: no specialized
// background, nothing to rate. Run through the form's own checks, so this
// fails loudly here if the form changes rather than storing something the
// platform would never have let through.
const INTAKE = intakeSchema.parse({
  role: "other",
  backgroundFlags: ["none"],
  focusNone: true,
  work: Object.fromEntries(WORK_AREAS.map((w) => [w.key, "none"])),
  aiUse: "weekly",
});

const USERS = Number(process.argv[2] ?? 20);
const TURNS = Number(process.argv[3] ?? 3);
const BASE = process.argv[4] ?? "http://localhost:3000";
// Whichever model the event currently offers first, so this keeps working
// when the list changes.
const MODEL = process.env.LOAD_TEST_MODEL ?? DEFAULT_MODELS[0].id;

type Result = {
  email: string;
  ok: boolean;
  submitted: boolean;
  replies: number;
  errors: string[];
  latencies: number[];
};

// Different on every run, so a second run does not collide with the accounts
// the first one left behind and report seventy failed sign-ups.
const RUN = Date.now().toString(36);

async function runUser(n: number): Promise<Result> {
  const email = `load-${RUN}-${n}@example.test`;
  const res: Result = {
    email,
    ok: false,
    submitted: false,
    replies: 0,
    errors: [],
    latencies: [],
  };
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
      intake: INTAKE,
      intakeVersion: INTAKE_VERSION,
      participationAgreedAt: new Date(),
      researchUseAgreedAt: new Date(),
    })
    .onConflictDoNothing();

  const convRes = await fetch(`${BASE}/api/conversations`, {
    method: "POST",
    headers: headers(),
    // Real or invented is the one thing asked before starting. Alternate, so
    // both are exercised.
    body: JSON.stringify({ modelId: MODEL, provenance: PROVENANCE_VALUES[n % PROVENANCE_VALUES.length] }),
  });
  if (!convRes.ok) {
    res.errors.push(`conversation ${convRes.status}`);
    return res;
  }
  const { id: conversationId, episodeId } = (await convRes.json()) as {
    id: string;
    episodeId: string;
  };

  const send = (t: number) =>
    fetch(`${BASE}/api/chat`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        conversationId,
        messages: [
          { id: `m${t}`, role: "user", parts: [{ type: "text", text: `Load message ${t}` }] },
        ],
      }),
    });

  for (let t = 0; t < TURNS; t++) {
    const started = Date.now();
    let chat = await send(t);
    // One reply at a time: a message sent before the last reply has been
    // saved is refused. The stream ending and the reply being saved are
    // close together but not the same moment, so allow for it once.
    if (chat.status === 409) {
      await chat.text();
      await new Promise((r) => setTimeout(r, 1000));
      chat = await send(t);
    }
    if (!chat.ok) {
      res.errors.push(`chat ${chat.status}`);
      continue;
    }
    // Drain the stream so the server reaches its completion handler.
    await chat.text();
    res.latencies.push(Date.now() - started);
    res.replies++;
  }

  // Submit, as the participant's Submit button does. Called directly for
  // the same reason onboarding is: the button is a server action.
  if (res.replies > 0) {
    try {
      await submitEpisode(episodeId, u.id);
      res.submitted = true;
    } catch (e) {
      res.errors.push(`submit: ${e instanceof Error ? e.message : String(e)}`);
    }
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
  // Each submitted conversation is one episode and, being a single session,
  // one view for reviewers.
  const [{ episodes }] = await db
    .select({ episodes: sql<number>`count(*)::int` })
    .from(episode)
    .where(and(inArray(episode.userId, ids), eq(episode.status, "submitted")));
  const [{ views }] = await db
    .select({ views: sql<number>`count(*)::int` })
    .from(reviewView)
    .innerJoin(episode, eq(episode.id, reviewView.episodeId))
    .where(inArray(episode.userId, ids));

  console.log("");
  console.log(`  wall clock        ${elapsed.toFixed(1)}s`);
  console.log(`  replies           ${actualReplies}/${expectedReplies}`);
  console.log(`  users with errors ${failed.length}/${USERS}`);
  console.log(`  latency p50       ${percentile(latencies, 50)}ms`);
  console.log(`  latency p95       ${percentile(latencies, 95)}ms`);
  console.log(`  latency max       ${Math.max(0, ...latencies)}ms`);
  console.log(`  assistant rows    ${assistants}`);
  console.log(`  usage events      ${events} (${tokens} tokens)`);
  console.log(`  submitted         ${episodes}/${USERS} (${views} review views)`);
  if (failed.length > 0) {
    console.log("");
    console.log("  first errors:");
    for (const f of failed.slice(0, 5)) console.log(`    ${f.email}: ${f.errors.join(", ")}`);
  }
  process.exit(
    failed.length === 0 &&
      assistants === expectedReplies &&
      episodes === USERS &&
      views === USERS
      ? 0
      : 1,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
