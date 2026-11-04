# Astral Platform — Product Spec (MVP)

Status: draft v1, 2026-11-03. Owner: Jess. Audience: the build team (currently Jess + Claude).

Astral is a web platform used during a one-day, in-person transcript-generation
event in Boston. About 60 participants with mixed life-science and CS
backgrounds chat with frontier and open-weight LLMs, label each conversation,
and submit it. The submitted transcripts and their labels become a dataset for
an AI x biosecurity misuse scanner. Cash prizes reward range and quality.

This document says **what** the system does. `ARCHITECTURE.md` says **how**.

---

## 1. Goals and non-goals

### Goals

1. Participants with no AI tooling experience can sign up, chat, label and
   submit.
2. Every submitted transcript lands in Postgres with complete labels, the
   participant's profile, and the raw model request/response data.
3. 60 concurrent users, each with several open conversations, with no visible
   slowdowns and no lost data.
4. Admins can see live counts per transcript type, a per-participant
   leaderboard, and can unblock a participant (raise budget, un-pause).
5. Participants can run fixed "scanner" judges on a transcript to learn how
   common tools react to it.

### Non-goals for the MVP

- Per-message labels (beyond an optional "key turn" marker).
- Editing earlier prompts or model replies. Regenerate is supported, edit is not.
- Deleting transcripts.
- Public leaderboard for participants.
- Image or file uploads in chat.
- Self-hosted models. Everything goes through OpenRouter.

---

## 2. Users and roles

| Role        | Who                        | Can do                                                                 |
|-------------|----------------------------|------------------------------------------------------------------------|
| Participant | Event attendee             | Sign up, complete profile, accept terms, chat, label, submit, run judge |
| Admin       | Jess | Everything a participant can, plus the admin console                   |

Admin is a boolean on the user row, set manually in the database or via an
environment variable listing admin emails. There is no admin sign-up flow.

---

## 3. Participant journey

```
Sign up ──▶ Profile + Terms (forced) ──▶ Chat home ──▶ New conversation
                                              │              │
                                              │              ▼
                                              │     choose model, optional scenario
                                              │              │
                                              │              ▼
                                              │     chat (stream, regenerate)
                                              │              │
                                              │              ▼
                                              │     fill labels ──▶ Submit (v1)
                                              │              │
                                              │              ▼
                                              │     keep chatting / relabel ──▶ Update (v2, v3 ...)
                                              │
                                              └──▶ Judge panel (persists across conversations)
```

### 3.1 Sign up and sign in

- Email + password. Minimum 8 characters. No email verification for the MVP
  (participants are physically present and we want zero friction).
- Sign-up requires an **event code** (a single shared string, set by the
  admin) so random internet visitors cannot create accounts.
- Forgot password: admin resets from the console (sets a temporary password).
  No email provider needed on event day.

### 3.2 Onboarding gate: profile and terms

After the first sign-in the participant is redirected to `/onboarding` and
cannot reach any other page until both steps are complete.

**Profile fields**

| Field                    | Type                         | Required |
|--------------------------|------------------------------|----------|
| Full name                | text                         | yes      |
| Affiliation              | text (institution / company) | yes      |
| Role                     | select: undergrad, grad student, postdoc, faculty, industry scientist, industry engineer, policy / governance, other | yes |
| Highest degree           | select: none, BS, MS, PhD, MD, other | yes |
| Years of experience      | select: 0-1, 2-4, 5-9, 10+   | yes      |
| Primary background       | select: life sciences, computer science / ML, both, other | yes |
| Life-science subdomains  | multi-select: virology, bacteriology, synthetic biology, molecular biology, immunology, toxicology, bioinformatics, biosafety / biosecurity, clinical, other | no |
| AI familiarity           | select: never used chatbots, casual user, regular user, build with LLM APIs | yes |
| Free-text expertise note | textarea                     | no       |

**Terms and conditions**

- Placeholder text for now, stored in the database as `terms_versions` rows
  with a version number and body.
- Acceptance stores `terms_version` and `terms_accepted_at` on the user.
- If the admin publishes a new terms version, participants are re-gated on
  next page load.

### 3.3 Chat home

- Left sidebar: list of the participant's conversations, newest first, with
  a status badge: **Draft**, **Submitted v1**, **Submitted v2 (changed)**.
- "New conversation" button.
- The participant's own submitted count is shown in the sidebar (just a
  number, no comparison to other participants).
- Top bar: participant name, remaining budget indicator (simple, e.g. "Plenty"
  / "Running low"), sign out.
- Right side: collapsible **Judge panel** (see 3.7).

### 3.4 New conversation

- Model picker: a ChatGPT-style dropdown (a single control that opens a
  grouped menu: Anthropic, OpenAI, Open weight), curated by the admin. List:
  - Claude: the current Sonnet and Opus models.
  - GPT: the current GPT-5 family flagship and a smaller/faster variant.
  - Open weight: the strongest two or three available, e.g. Llama 4 Maverick,
    Qwen3 235B, DeepSeek V3.x, gpt-oss-120b, Kimi K2. Final list chosen the
    week of the event from what OpenRouter actually serves reliably.
- Optional **Scenario** box (this is the system prompt, see glossary in
  ARCHITECTURE.md). Placeholder text explains it: "Optional. Set the scene for
  the model, for example 'You are a helpful assistant at a BSL-2 teaching lab.'
  The model sees this before your first message. Leave blank for the model's
  default behaviour."
- Scenario and model are locked once the first message is sent, so the
  transcript is internally consistent. A participant who wants a different
  model starts a new conversation.

### 3.5 Chatting

- Standard streaming chat. Markdown rendered. Code blocks with copy button.
- **Regenerate** on the last assistant message. The replaced message is kept
  in the database and marked superseded, but hidden from the UI.
- **Stop** button while streaming.
- No editing of prior messages in the MVP.
- Errors are shown inline and never lose the typed message. Specific messages
  for: provider refused at the API level (content filter), rate limited
  (auto-retries once, then tells the user to wait 10 seconds), budget exhausted
  (tells them to find the admin), model paused by admin.

### 3.6 Labeling and submitting

A **Labels** drawer is available at all times on a conversation and is
required before the first submit.

| Field                 | Type                                               | Required |
|-----------------------|----------------------------------------------------|----------|
| Transcript type       | select: benign, dual use, adversarial              | yes      |
| Intended role         | select preset + free text. Presets: academic researcher, industry scientist, student, clinician, biosecurity professional, journalist / curious public, regulatory evader, lone malicious actor, organised group, nation-state program, other | yes (preset); text optional |
| Intended goal         | textarea: what were you trying to get the model to do? | yes   |
| Model behaviour       | select: fully complied, partially complied, refused, deflected / unclear | yes |
| Domain tags           | multi-select: virology, bacteriology, toxins, synthetic biology, gain of function / enhancement, acquisition of agents or materials, lab protocols, biosafety, bioinformatics, policy / regulation, other | yes, at least one |
| Key turn              | optional pointer to the message where the conversation pivoted | no |
| Challenge flag        | optional: "refusal was unwarranted" / "model complied with something dangerous" | no |
| Notes                 | textarea                                           | no       |

**Submit** creates version 1 of the submission: an immutable snapshot of the
conversation (scenario, all non-superseded messages, labels, model id) plus a
timestamp. The conversation stays open.

**Update** is the same button after a first submit. It is enabled only if the
messages or labels changed since the last snapshot, and it creates version
N+1. The admin console and exports default to the latest version but keep all.

If versioning turns out to be awkward in implementation it degrades to
"overwrite on update, keep `first_submitted_at` and `last_submitted_at`". The
schema is designed so either is a small change.

### 3.7 Judge panel

- Participants click **Run judge** on any conversation (draft or submitted).
- They pick from the admin-defined judge configs, for example:
  - "LLM judge (Claude Sonnet)": a fixed rubric prompt asking for a risk
    category, a 0 to 10 severity, and a two-sentence rationale, returned as
    JSON and rendered nicely.
  - "Llama Guard 4": the open-weight safety classifier served by OpenRouter
    (`meta-llama/llama-guard-4-12b`), returning safe/unsafe plus category codes.
- Results appear in the **right-hand Judge panel**, which is a persistent
  list across the whole session: each entry shows conversation title, judge
  name, time, and the verdict. Clicking an entry opens the full result and
  the conversation. The panel survives navigating between conversations and
  page reloads, because results are stored in the database.
- Judge runs are rate-limited per participant (default 20 per hour, admin
  adjustable) because they are expensive and not the point of the event.
- Judge results are for participant learning only. Participants see the
  results of their own runs and nobody else's. Results are stored, but the
  MVP admin console does not surface them and they play no role in prizes.
  "Judge" here always means an automated LLM or safety-model judge; there is
  no human-judge functionality in the platform.

---

## 4. Admin console (`/admin`)

MVP pages, in priority order:

1. **Overview**
   - Total submitted transcripts (latest version counted once per
     conversation) and total drafts.
   - Counts per transcript type: benign / dual use / adversarial.
   - Counts per model behaviour and per domain tag (small tables).
   - Submissions over time (one simple sparkline, last 8 hours).
   - Token usage today and estimated spend.
   - Global controls: **Pause all chat** toggle, per-model enable/disable.
2. **Participants**
   - Table: name, affiliation, background, conversations, submitted count,
     tokens used, budget, status. Sortable. This is the leaderboard.
   - Row actions: raise budget, pause/unpause, reset password, make admin.
3. **Transcripts**
   - Table of all conversations with status, type, participant, model,
     message count, last submitted. Click to read the transcript and labels.
4. **Settings**
   - Event code.
   - Default per-participant daily token budget.
   - Enabled models list (model id, display name, order).
   - Judge configs: name, kind (llm / llama_guard), model id, prompt template,
     enabled. Starts with the two defaults seeded.
   - Terms versions: publish a new version.
5. **Export**
   - Button: download JSONL of all submissions (latest version by default,
     "all versions" checkbox). One line per submission with embedded profile,
     labels, messages, and raw payloads.

---

## 5. Data captured per transcript

Everything below is stored in Postgres and included in the JSONL export.

- Participant profile (joined at export time; also snapshotted on submit so
  later profile edits do not change history).
- Conversation: id, model id, scenario (system prompt), created/updated times.
- Messages in order, with role, text, timestamps, and for assistant messages:
  - the exact request body sent to OpenRouter (model, messages, parameters),
  - the exact response: OpenRouter generation id, the **actual provider and
    model variant that served it** (OpenRouter routes between providers),
    finish reason (`stop`, `length`, `content_filter`, `error`),
    token counts (prompt, completion, reasoning if any), latency,
  - any error object, which matters because an API-level refusal produces
    **no rendered message at all** but is still a refusal worth recording,
  - superseded flag for regenerated replies.
- Labels (current) and the submission snapshot per version.
- Judge runs: config, input hash, raw output, parsed verdict, timestamp.
- Usage events for budget accounting.

This is the answer to "what is in the raw payloads that isn't in the rendered
messages": provider routing, finish reasons, token counts, hidden reasoning
token counts, exact parameters, and silent refusals/errors.

---

## 6. Budgets, limits and abuse prevention

- One server-side OpenRouter key. Participants never see it.
- OpenRouter enforces limits **per account, not per key**, so sub-keys would
  not buy extra capacity. Our own accounting is the control plane.
- Per-participant soft budget: default 5,000,000 tokens per day, admin
  adjustable per participant and globally. Purpose: catch a runaway script or
  a copy-paste loop, not to ration honest use. At 60 participants this caps
  the worst day at 300M tokens, far below what the team has used before.
- Per-participant chat rate limit: 20 requests per minute. Judge: 40 per hour.
- Event code required to sign up. Admin can pause a participant instantly.
- Global pause toggle for emergencies.
- Automatic retry on 429/5xx once, then a friendly error. No automatic
  cross-model fallback by default, because it would silently change which
  model produced a transcript. (Admin can enable fallback to a sibling
  model as an emergency setting; when active, the actual model is always
  recorded.)

---

## 7. Non-functional requirements

| Requirement          | Target                                                             |
|----------------------|--------------------------------------------------------------------|
| Concurrency          | 60 users, up to 150 simultaneous streaming chats                   |
| Chat first token     | < 3 s p95 excluding provider latency                               |
| Page load            | < 2 s on venue wifi                                                |
| Data durability      | Every message persisted before the stream completes; no loss on crash |
| Recovery             | If the app goes down, back within 15 minutes with no data loss    |
| Observability        | Admin overview shows errors in the last 15 minutes; logs searchable |
| Load test            | Scripted simulation of 80 users before event day                   |

---

## 8. Event-day operations (brief)

- Day before: run load test, seed judge configs, set event code, confirm
  OpenRouter key limit and balance via `GET /api/v1/key`, warm the database.
- Morning: project the admin overview on a screen for yourself, not for
  participants.
- During: the only expected interventions are raising budgets and resetting
  passwords. Both are one click.
- After: export JSONL, snapshot the database, revoke the event code.

---

## 9. Build plan (phases)

Each phase ends with something you can click.

1. **Skeleton**: Next.js app, Postgres on Neon, Drizzle schema + migrations,
   Better Auth email/password, deployed to Vercel on a `*.vercel.app` URL.
2. **Onboarding**: profile form, terms gate, event code.
3. **Chat**: conversation list, model picker, scenario, streaming chat,
   regenerate, full persistence of raw payloads, usage accounting.
4. **Labels + submit**: labels drawer, submit/update with snapshots.
5. **Judge**: two judge configs, judge panel.
6. **Admin**: overview counts, participants table with actions, transcripts
   viewer, settings, JSONL export.
7. **Hardening**: rate limits, budget enforcement, error UX, load test
   script, custom domain, runbook.

---

## 10. Open questions

1. Final model list: decide the week of the event from OpenRouter availability.
2. Terms text: placeholder until you have real text.
3. Should participants be able to see their own submission count? Default: yes,
   a small number in the sidebar, no comparison to others.
4. Do you want participants to be able to flag "I think the model's refusal
   was wrong / the compliance was dangerous"? This is a cheap extra label.
