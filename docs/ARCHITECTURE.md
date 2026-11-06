# Astral Platform — System Design

Companion to `SPEC.md`. This document explains how the system is built and,
because the team is new to parts of this stack, explains *why* at each step.
Sections marked **Concept** are short explainers you can skip if you already
know the idea.

---

## 1. One-paragraph summary

A single Next.js application, hosted on Vercel, talks to a managed Postgres
database on Neon and to OpenRouter for every model call. The browser streams
chat responses from a Next.js route handler, which persists every message and
the raw provider payload to Postgres as it goes. There is no separate backend
service, no queue, and no Redis in the MVP. Admin pages live in the same app
behind an admin flag.

```
 Browser (participant or admin)
   │  HTTPS
   ▼
 Vercel ── Next.js app (React UI + route handlers)
   │            │
   │            ├──▶ Neon Postgres  (users, conversations, messages, labels,
   │            │                     submissions, judge runs, usage, settings)
   │            │
   │            └──▶ OpenRouter API (chat completions, judge calls)
   │                      └──▶ Anthropic / OpenAI / open-weight providers
   ▼
 Vercel logs + Neon metrics  (observability)
```

---

## 2. Stack and the reasoning behind each choice

| Layer         | Choice                                   | Why                                                                 |
|---------------|------------------------------------------|---------------------------------------------------------------------|
| Framework     | Next.js 15, App Router, TypeScript       | One codebase for UI and API; first-class streaming; huge ecosystem  |
| UI kit        | Tailwind CSS + shadcn/ui                 | Copy-paste components you own, no design system lock-in            |
| Chat plumbing | Vercel AI SDK (`ai` v5) + `@openrouter/ai-sdk-provider` | `useChat` handles streaming, stop, regenerate, and message state in the browser; the provider package speaks OpenRouter |
| Auth          | Better Auth (email + password)           | Modern, built-in password flows, Drizzle adapter, admin plugin for pause/reset |
| ORM           | Drizzle ORM                              | Schema in TypeScript, SQL-like queries, simple migrations           |
| Database      | Postgres on Neon                         | Managed, has a built-in connection pooler (needed on serverless), branching for dev/test, generous free tier |
| Hosting       | Vercel (Pro plan for the event)          | Zero-config Next.js deploys, automatic scaling, streaming up to 800 s per request on Pro |
| Models        | OpenRouter, one server-side key          | One API for Claude, GPT and open-weight; unified usage reporting     |
| Judge         | OpenRouter too (`meta-llama/llama-guard-4-12b` and an LLM judge) | No GPU box to run and babysit on event day |
| Load testing  | k6 or a small Node script                | Simulate 80 users streaming at once                                 |

### Why not Open WebUI?

It is the most popular open-source chat UI and would give a polished chat
screen on day one. But most of Astral's product is *around* the chat:
onboarding gate, labels, submit/update versions, judge panel, admin counts.
Open WebUI is a large Python + Svelte monolith; adding those flows means
learning and patching its internals. With Next.js the chat screen costs a few
hundred lines using the AI SDK, and everything else is ordinary web app work.

### Why not fork Vercel's `ai-chatbot` template?

It is a good reference and we will borrow patterns from it (route handler
shape, message rendering, sidebar). Forking it wholesale brings features we
would have to remove (artifacts, document tools, multimodal) and an auth setup
we would replace. Starting clean keeps the codebase small enough to understand.

### Why no Redis / Celery / queue?

**Concept: background job queues.** Celery (Python) and BullMQ (Node) exist
for work that should not happen inside a web request: sending 10,000 emails,
nightly reports, jobs that take minutes. They need a broker (Redis) and a
separate always-on worker process.

Astral's only long operations are LLM calls, and those are *streamed back to
the waiting user*, which is exactly what a web request should do. The judge is
a single 10 to 40 second call shown to the user when done. Nothing needs to
outlive a request. Rate limits and budgets for 60 users can be counted in
Postgres. If we later add batch jobs (re-judging every transcript overnight,
for example), the right Vercel-native tools are Vercel Cron or Inngest, not a
self-managed Redis.

### Why Vercel rather than a VM or container host?

**Concept: redundancy and recovery targets.** A "15 minute recovery target"
(RTO, recovery time objective) means: if the app dies, it is back within 15
minutes. "Redundancy" means running two or more copies so one dying is
invisible. On a single VM you get neither for free: you watch it, and if it
crashes you ssh in and restart.

On Vercel each request runs in a managed, auto-scaled function, so there is no
single server to die. Neon runs the database with its own failover. In
practice redundancy comes with the platform at no extra cost, which is why
this is the recommendation. The realistic failure modes become: a bad deploy
(fix: Vercel's one-click rollback), OpenRouter or a provider being down
(fix: switch models in admin), or Neon maintenance (rare; check their status
page the day before).

Railway or Fly.io running one container plus managed Postgres would also work
and is simpler to picture (one long-running Node process). The tradeoff is
you own restarts and scaling. Either is fine for 60 users; Vercel is chosen
for the smoothest Next.js experience.

---

## 3. Concepts you asked about

### Domain names and provider subdomains

Vercel gives every project a free URL like `astral-platform.vercel.app`. That
is a **provider subdomain**: a name under Vercel's domain. It works fully,
has HTTPS, and is fine for a one-day event. A **custom domain** like
`astral-event.org` costs roughly 10 to 15 USD per year and looks more
credible on a projector and in a terms document. To get one:

1. Buy it at a registrar. Cloudflare Registrar and Porkbun sell at cost;
   Namecheap is fine too. Takes five minutes with a credit card.
2. In Vercel, Project → Settings → Domains, add the domain. Vercel shows two
   DNS records to create at the registrar. Copy them in.
3. Wait up to an hour. Vercel issues the HTTPS certificate automatically.

Recommendation: start on the `.vercel.app` URL, buy a domain once the name is
settled, add it in phase 7.

### System prompt per conversation

**Concept.** Every chat request to a model is a list of messages with roles:
`system`, `user`, `assistant`. The `system` message is hidden instruction text
sent before the conversation. It sets persona, context and constraints, e.g.
"You are a lab manager at a BSL-3 facility helping staff with procedures."
Without one, the model uses its provider's default behaviour.

For this event it matters because (a) a lot of real-world misuse and benign
use happens inside products that set a system prompt, (b) role-play attacks
often live in the system prompt, and (c) scanners need to see it. In Astral it
is the optional "Scenario" field, stored on the conversation and sent as the
`system` message on every request. OpenRouter's own injected text (none by
default) is not involved.

### Regenerate

With the AI SDK this is one call in the browser (`regenerate()`), which
re-sends the conversation minus the last assistant reply. On the server we
mark the old reply `superseded_by = <new message id>` rather than deleting it,
so the dataset keeps both. Cost: about 20 lines. Editing earlier user
messages would require branching conversations and is deliberately out of
scope.

### OpenRouter rate and credit limits, and where to look

- Limits are enforced **per account across all keys**, so one key versus many
  makes no difference to capacity. One server-side key is the right call.
- Paid models have no fixed requests-per-minute number; capacity is governed
  globally and by upstream providers. The practical risks are upstream 429s on
  a specific model at peak and a per-key spending cap if one was set.
- Where to check: `https://openrouter.ai/settings/keys` shows each key's
  optional credit limit; `https://openrouter.ai/settings/credits` shows
  balance; `https://openrouter.ai/activity` shows usage. Programmatically,
  `GET https://api.openrouter.ai/api/v1/key` with your key returns `limit`,
  `usage` and `limit_remaining`. The admin overview will call this and show it.
- A teammate using 2B tokens in a day suggests the account itself is not the
  bottleneck. Action item: create a dedicated key for Astral with **no**
  spending cap (or a cap well above expected spend), and confirm with whoever
  administers the team account that there is no per-member soft cap.
- Our own per-participant budget is therefore a safety net against runaway
  use, not a rationing mechanism. Default 3M tokens/day/participant.

Sources: OpenRouter limits docs
(https://openrouter.ai/docs/api/reference/limits), BYOK docs
(https://openrouter.ai/docs/features/byok).

### Serverless and database connections

**Concept.** On Vercel each request may run in a fresh function instance, so
naive code opens a new Postgres connection per request and exhausts the
database's connection limit under load. Neon's built-in pooler (a PgBouncer
endpoint) sits in front of Postgres and multiplexes thousands of short
connections onto a few real ones. We always connect through the pooled
connection string. Drizzle works unchanged.

---

## 4. Data model

Postgres, managed by Drizzle migrations. Names are final enough to build on.

```
users                     (Better Auth) id, email, password hash, name, created_at
                          + our columns: is_admin, is_paused, daily_token_budget,
                            terms_version, terms_accepted_at, profile_completed_at
profiles                  user_id PK, affiliation, role, highest_degree,
                          years_experience, primary_background,
                          subdomains text[], ai_familiarity, expertise_note
sessions / accounts       (Better Auth internal tables)

terms_versions            version PK, body, published_at

event_settings            singleton row: event_code, default_daily_token_budget,
                          chat_paused bool, judge_runs_per_hour, enabled_models jsonb
                          [{id, display_name, family, sort}]

conversations             id, user_id, title, model_id, scenario text,
                          status enum(draft, submitted), current_version int,
                          first_submitted_at, last_submitted_at,
                          created_at, updated_at, last_message_at

messages                  id, conversation_id, seq int, role enum(user, assistant),
                          content text, parts jsonb,
                          model_id, provider, generation_id,
                          finish_reason, prompt_tokens, completion_tokens,
                          reasoning_tokens, latency_ms,
                          raw_request jsonb, raw_response jsonb, error jsonb,
                          superseded_by (message id, nullable), created_at

transcript_labels         conversation_id PK, type enum(benign, dual_use, adversarial),
                          role_preset, role_text, goal_text,
                          model_behaviour enum, domain_tags text[],
                          key_turn_message_id, notes, updated_at

submissions               id, conversation_id, version int,
                          snapshot jsonb {scenario, model_id, messages[], labels, profile},
                          submitted_at
                          UNIQUE (conversation_id, version)

judge_configs             id, name, kind enum(llm, llama_guard), model_id,
                          prompt_template text, output_schema jsonb,
                          enabled bool, sort int

judge_runs                id, conversation_id, user_id, judge_config_id,
                          input_hash, raw_output text, parsed jsonb,
                          verdict text, status enum(ok, error), created_at

usage_events              id, user_id, conversation_id, message_id,
                          kind enum(chat, judge), model_id,
                          prompt_tokens, completion_tokens, cost_usd, created_at
                          INDEX (user_id, created_at)
```

Design notes:

- `messages.parts` holds the AI SDK's structured message parts (text,
  reasoning if the model exposes it). `content` is the flattened text for easy
  SQL. Both are kept.
- Budget check is `SELECT sum(prompt_tokens + completion_tokens) FROM
  usage_events WHERE user_id = ? AND created_at > now() - interval '1 day'`.
  Cheap at this scale with the index.
- Submission snapshots make versioning trivial: a submit is one INSERT. The
  admin "latest version" query is a window function or a join on
  `current_version`.
- Soft deletes are not needed because deletion is out of scope.

---

## 5. Key flows

### 5.1 Chat request

```
browser useChat ──POST /api/chat {conversationId, messages}──▶ route handler
  1. auth: load session; reject if paused, not onboarded, or chat_paused
  2. rate limit: count user's chat usage_events in last 60 s (< 10)
  3. budget: sum tokens last 24 h < budget
  4. persist the new user message (seq = max+1)
  5. build request: [system: scenario] + non-superseded messages
  6. streamText via OpenRouter provider; pipe stream to browser
  7. onFinish: persist assistant message with raw request/response,
     usage, provider, finish_reason; insert usage_event
  8. on error: persist an assistant message with error jsonb and
     finish_reason = 'error' so silent refusals are in the dataset
```

The route sets `maxDuration = 300` so long generations are not cut off.
Steps 4 and 7 are the only writes; step 7 happens after the stream closes so
no transaction is held open while streaming.

**Concept: why persist on the server, not from the browser.** If the
participant closes the tab mid-stream the server still finishes `onFinish`
and saves what was generated. The browser is never the source of truth.

### 5.2 Regenerate

Browser calls `regenerate()`. Server receives the same conversation minus the
last assistant message, marks that message `superseded_by` once the new one is
saved, and streams the replacement.

### 5.3 Submit / update

`POST /api/conversations/:id/submit` validates labels (server-side, same
schema as the form), builds the snapshot in one query, inserts
`submissions(version = current_version + 1)`, and updates the conversation.
"Update" is enabled in the UI when `conversation.updated_at >
last_submitted_at` or labels changed, with the server re-checking.

### 5.4 Judge run

`POST /api/judge` with `{conversationId, judgeConfigId}`. Server checks the
hourly limit, builds the transcript text, calls OpenRouter (non-streaming),
parses the output per the config's `kind`, stores `judge_runs`, and returns
the row. The Judge panel fetches `/api/judge/runs` on mount and after each
run, so it persists across navigation and reloads.

### 5.5 Admin overview

Plain SQL aggregates, refreshed every 15 seconds with a client-side poll.
No websockets needed for one viewer.

### 5.6 Export

`GET /api/admin/export?versions=latest|all` streams JSONL: one line per
submission with the snapshot, participant profile, and the full messages with
raw payloads re-joined from `messages` (snapshots store message ids and text;
raw payloads are joined at export to keep snapshots small).

---

## 6. Security and privacy

- OpenRouter key only in Vercel environment variables, never in client code.
- All `/api/admin/*` routes and `/admin` pages check `is_admin` server-side.
- Participants can only read their own conversations (every query filters by
  `user_id`; no conversation id is trusted from the client without that join).
- Passwords hashed by Better Auth (scrypt). Sessions are HTTP-only cookies.
- Event code is compared server-side with a constant-time comparison.
- Transcripts intentionally contain sensitive content. The database is not
  public; exports are downloaded only by the admin. Add Neon IP allowlisting
  if the team wants it later.
- Logs must never include message content. Log ids and token counts only.

---

## 7. Scale and performance

Expected peak: 60 users, each with up to 3 active streams: ~150 concurrent
requests, each holding a function instance for 5 to 60 seconds. Vercel
scales functions per request; Neon pooler handles the connection burst. Reads
on the chat home page are small indexed queries. This is well inside the
comfortable range for both platforms, which is why there is no cache layer.

Risks and mitigations:

| Risk                                  | Mitigation                                                   |
|---------------------------------------|--------------------------------------------------------------|
| One model gets 429s at peak           | Admin disables it; participants pick another                 |
| OpenRouter spend cap on the key       | Check `GET /v1/key` the day before; admin overview shows it  |
| Vercel function timeout               | `maxDuration = 300`, Pro plan                                |
| Neon connection exhaustion            | Always use the pooled connection string                      |
| A participant's script hammers the API| Per-user rate limit and budget; pause button                 |
| Bad deploy during the event           | Deploy only before 9 am; Vercel instant rollback otherwise   |

Load test: a Node or k6 script that signs in 80 synthetic users, each
starting 2 conversations, sending 10 messages with realistic pauses, and
submitting. Run against a Neon branch and a Vercel preview deployment with a
cheap open-weight model, then read p95 latencies and error counts.

---

## 8. Environments and workflow

- **Local**: `npm run dev` against a Neon dev branch (Neon branches are
  copy-on-write clones of the database, free, great for experiments).
- **Preview**: every git push to a non-main branch gets a Vercel preview URL
  and can point at a Neon preview branch.
- **Production**: `main` deploys to the event URL.

Environment variables:

```
DATABASE_URL                 Neon pooled connection string
BETTER_AUTH_SECRET           random 32+ bytes
BETTER_AUTH_URL              https://<your domain>
OPENROUTER_API_KEY           server-side only
ADMIN_EMAILS                 comma-separated; these users get is_admin on sign-up
```

Repository layout (planned):

```
app/
  (auth)/sign-in, sign-up
  onboarding/
  (app)/chat/[conversationId]   participant UI
  admin/                        admin pages
  api/chat, api/judge, api/conversations, api/admin/*
components/                     shadcn + chat components + judge panel
db/schema.ts, db/migrations/    Drizzle
lib/auth.ts, lib/openrouter.ts, lib/budget.ts, lib/judges/
scripts/load-test.ts, scripts/seed.ts
docs/
```

---

## 9. What we deliberately postponed

- Per-message labels and conversation branching.
- Multiple admins with roles.
- Email verification and self-service password reset (needs an email provider).
- A public participant leaderboard.
- Judge results in the admin console and prize scoring.
- Automatic model fallback (exists as an off-by-default emergency setting).
- Self-hosted safety models.

---

## 10. Post-MVP backlog (agreed, not yet built)

These are deliberately deferred. Better Auth already supports most of them,
so they are configuration and UI work rather than new infrastructure.

- **More admins, robust admin accounts.** Replace the single admin role with
  real roles. Better Auth's admin plugin already stores a `role` per user and
  has `setRole`, ban/unban, and impersonation built in, so "promote this user
  to admin" is a button, not a rebuild. The MVP already uses this plugin; we
  just do not expose role management in the UI yet.
- **Email verification for participants.** Better Auth has this built in
  (`requireEmailVerification` plus a send-email hook). It needs an email
  provider (Resend, Postmark, SES) wired up, which we skip for a one-day
  in-person event. Flip it on and add the provider post-event.
- **Themed dropdowns on the profile questions.** Onboarding and the profile
  page now share one set of fields (`components/profile-fields.tsx`), which
  still uses the browser's native `<select>`. That renders as the operating
  system's own dropdown and looks out of place against the rest of the
  design. Replace with a custom listbox component that matches the theme.
  Keep keyboard navigation and screen-reader labelling, which the native
  control gives us for free today.
- **Admin-editable forms and agreement.** The profile questions and the
  confidentiality agreement are currently defined in code (`lib/labels.ts`)
  and the seeded terms row. Move the question set into the database so the
  admin console can add, remove and reorder fields, and edit the agreement
  text, without a code change and redeploy. The terms table is already
  versioned, so the agreement half is mostly a UI; the profile half needs
  the profile table to store answers as structured data rather than fixed
  columns.
- **Email format checking.** Sign-up accepts whatever the browser's own email
  validation allows, which is lenient. Worth tightening so a typo does not
  cost someone their account on the day, when there is no password reset by
  email.
- **Password rules.** Currently only a minimum of 8 characters. Worth adding
  the usual checks, and rejecting the handful of passwords everyone tries.
- **Forgot password by magic link.** Asked about difficulty: it is not hard.
  The login library has it built in, and the work is almost entirely choosing
  an email provider and verifying the domain so mail is not treated as spam.
  Half a day, most of it waiting for DNS. The catch is that it is useless
  without working email on the day, which is why the event relies on an
  organizer resetting passwords instead. Worth adding afterwards.
- **Forgot password (self-service).** Better Auth has `requestPasswordReset`
  and `resetPassword` built in; they send a reset link by email, so this also
  waits on the email provider. For the event, the admin resets passwords
  directly, which needs no email.

So: yes, Better Auth handles all three. We are turning two of them off on
purpose because they depend on sending email, which is friction we do not
want with 60 people in a room for one day. The third (admin roles) is on
under the hood; only its management UI is deferred.

## 11. One trap worth knowing about: forms and server actions

React clears a form's DOM once an action returns, whether the action was
passed to `<form action={...}>` or carried on a submit button's
`formAction`. For a form that can be rejected this is wrong: the answers are
still on screen and the person is expected to correct one of them.

Controlling the values does not help a `<select>`. React writes a DOM value
only when the prop changes, and after the reset the prop has not changed, so
the select keeps whatever the reset left it with — the first option, or the
value the server last rendered — while the text fields beside it keep what
was typed. Half the form survives, which is harder to notice than losing all
of it.

Every form here with a reject path therefore goes through
`components/action-form.tsx`, which calls the action from a transition
instead. `ActionForm` wraps a form with one action; `useFormAction` is for a
form with several, such as the labels panel's Submit and Save, where each
button calls the action it wants and the form is read from the button that
was pressed.

If you add a form that can come back with errors, use one of those. If you
add one that cannot — a search box, a filter — `<form action>` is fine.

## 12. Known limitation: no document or sequence input

The MVP chat is text-only; participants cannot upload files or sequences.
This is a deliberate safety choice (we do not want people pasting material
from their own labs). The research tradeoff is that the dataset will not
contain the **sequence-scanning use cases** that a real misuse-detection
pipeline often cares about: a conversation where the user pastes a DNA or
protein sequence and asks the model to work with it. If those cases matter
for the scanner, they need a separate, controlled collection path with its
own handling rules, added after the event rather than mixed into an open
room of 60 people.
