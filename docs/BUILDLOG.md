# Build log

What is finished in each phase, and how to check it yourself. The plan for
all phases is in `SPEC.md` section 9. Newest phase last.

Before testing anything, start the app:

```bash
npm run dev
```

Then open http://localhost:3000. If you have not run them since your last
`git pull`, run `npm run db:migrate` and `npm run db:seed` first.

A note on test accounts: sign-up is gated by the event code in your
`.env.local` (`EVENT_CODE`). Any email listed in `ADMIN_EMAILS` becomes an
admin automatically on sign-up. To start over at any point, wipe the accounts
with the SQL at the bottom of this file.

---

## Phase 1 — Scaffold, database, authentication

Status: done.

### What exists

- Next.js app with Tailwind, the shared UI pieces, and the page shell.
- The full database schema and its migrations: accounts, profiles,
  conversations, messages (including the raw request and response from the
  model provider), labels, submissions, judge configs and runs, usage events,
  settings, and terms versions.
- Email and password authentication, with the admin role granted to the
  emails you list in `ADMIN_EMAILS`.
- Sign-up gated by a shared event code.
- A seed script that loads the settings row, placeholder terms, and the two
  judge configurations.
- The curated model list in `lib/models.ts`.

### How to test it

1. **The event code blocks strangers.** Go to http://localhost:3000/sign-up.
   Fill the form but type a wrong event code. You should see "That event code
   is not valid" and no account is created.
2. **Sign-up works with the right code.** Use the code from your `.env.local`.
   You should land on the profile page.
3. **You are an admin.** If you signed up with an email from `ADMIN_EMAILS`,
   finish the profile form and the chat page will say "(admin)" after your
   email address.
4. **Signing out and back in works.** Use the sign-out button, then sign in
   again at http://localhost:3000/sign-in with the same email and password.
5. **A wrong password is rejected.** Try signing in with a bad password and
   confirm you get an error rather than access.
6. **The data really is in Postgres.** Open the database browser with
   `npm run db:studio`, which runs at https://local.drizzle.studio. Look at
   the `user` table and you should see your account, with a `role` of `admin`
   if that applies to you.

### Verified automatically

Event code rejection and acceptance, sign-up assigning the admin role,
session retrieval, the redirect rules, and a clean production build.

---

## Phase 2 — Onboarding: profile and terms

Status: done.

### What exists

- A profile form covering name, affiliation, role, highest degree, years of
  experience, primary background, life-science subdomains, familiarity with
  AI chatbots, and an optional free-text note.
- The terms and conditions, rendered from the database, with a checkbox that
  records which version you accepted and when.
- A gate: until both the profile and the terms are done, every participant
  page sends you back to the onboarding page. Once they are done, the
  onboarding page sends you to the chat.
- Re-gating on new terms. If you publish a newer terms version, participants
  are asked to accept it again the next time they load a page, but they do
  not refill their profile.
- Validation on the server, not only in the browser, so the rules hold even
  if someone bypasses the form.
- A paused page for accounts an admin has suspended.

### How to test it

1. **The gate holds.** Create a fresh account. While sitting on the profile
   page, type http://localhost:3000/chat in the address bar. You should be
   sent straight back to the profile page.
2. **Validation works.** Submit the form with the terms checkbox unticked.
   You should see "You must accept the terms to continue" and stay on the
   page. Nothing is saved.
3. **A complete submission works.** Fill everything in, tick the terms box,
   and press Continue. You should land on the chat page, which confirms your
   profile is complete and names the terms version you accepted.
4. **Finished means finished.** Now type http://localhost:3000/onboarding in
   the address bar. You should be sent to the chat page instead, because
   there is nothing left to do.
5. **Your answers were stored.** In `npm run db:studio`, open the `profile`
   table. Your affiliation, role and chosen subdomains should be there. In
   the `user` table, `terms_accepted_at` and `terms_version` should be filled
   in.
6. **New terms re-gate.** This one is optional and needs a SQL console. Add a
   version 2 of the terms, reload any page, and you should be asked to accept
   again without refilling your profile:

   ```sql
   INSERT INTO terms_version (version, body)
   VALUES (2, '# Updated terms\n\nThis is version 2.');
   ```

### Verified automatically

A browser test drives the whole path: sign-up, the gate bouncing a direct
visit to the chat, server-side validation rejecting an incomplete form with
all eight field errors, a successful submission reaching the chat, the
redirect once onboarding is done, and the correct rows landing in the
database. The page also loads with no console errors.

---

## Phase 3 — Chat

Status: done.

### What exists

- A conversation list in the sidebar, with each conversation's status and
  your own submitted count.
- A model dropdown in the style of ChatGPT: one control that opens a grouped
  menu (Anthropic, OpenAI, Open weight) with a short note under each model.
  It is a custom component, so it matches the theme rather than using the
  operating system's own dropdown.
- An optional scenario box, which becomes the system message the model reads
  before the conversation. The model and scenario are fixed once the first
  message is sent, so a transcript stays internally consistent.
- Streaming replies, a stop button, and regenerate. A regenerated reply does
  not delete the old one: it is kept and hidden, so the dataset holds both.
- Full persistence of every exchange: the exact request sent to the provider,
  the generation id, which provider actually served it, the finish reason,
  token counts including reasoning tokens, cost and latency. Requests that
  fail at the API level are stored too, since a refusal that produces no
  visible text is still a refusal worth recording.
- Limits: a per-user daily token budget, a per-minute send limit, a global
  pause, and per-account pause. Each has its own clear message.

### Testing without an API key

The chat path can be exercised with no OpenRouter key and no spend. In one
terminal:

```bash
npm run mock-openrouter
```

Add this line to `.env.local`, then start the app as usual in another
terminal:

```bash
OPENROUTER_BASE_URL=http://127.0.0.1:4010/api/v1
```

Replies will be obviously fake. Remove that line and put a real key in
`OPENROUTER_API_KEY` to see real model behaviour.

### How to test it

1. **Starting a conversation.** From the chat page, open the model dropdown.
   It should show three groups with eight models. Pick one, type a scenario
   such as "You are a lab manager at a BSL-2 teaching facility", and press
   Start conversation.
2. **Chatting.** Send a message. The reply should stream in word by word. The
   scenario is shown above the conversation, and the model name sits in the
   top left with a note that it is fixed.
3. **Regenerate.** After a reply, press Regenerate. You get a different reply.
   The old one disappears from view but is still in the database, which you
   can confirm in `npm run db:studio`: look at the `message` table for a row
   with `superseded_by` filled in.
4. **The sidebar.** Your conversation appears with a title taken from your
   first message, marked Draft.
5. **Everything was recorded.** In `npm run db:studio`, open `message` and
   look at an assistant row. You should see the model, provider, finish
   reason, token counts, cost and latency, plus `raw_request` holding the
   exact payload sent to the provider, including your scenario as the system
   message.
6. **Limits.** With a SQL console you can prove each guard works. Set a tiny
   limit, send a message, and you should get a clear message rather than a
   broken page. Put the value back afterwards.

   ```sql
   UPDATE event_settings SET chat_requests_per_minute = 1 WHERE id = 1;
   UPDATE event_settings SET chat_paused = true WHERE id = 1;
   ```

### Load testing

A script simulates many participants chatting at once. With the mock provider
running it costs nothing:

```bash
npm run load-test -- 70 3
```

That signs up 70 users, each sending three messages, and reports how many
replies arrived, the latency spread, and whether the database agrees with
what the clients saw.

### Verified automatically

A browser test covers the dropdown, scenario, streaming, regenerate and the
sidebar, with no console errors. Separate checks confirm that one participant
cannot open or post to another's conversation, that a model outside the
allowed list is refused, and that the budget, rate limit, global pause and
account pause each return their own clear response.

Two concurrency faults were found and fixed during this phase. Simultaneous
messages in one conversation used to collide on the message sequence number
and fail; appends now take a short lock on the conversation so they queue
correctly, while different conversations stay fully parallel. The per-minute
limit used to let a burst through, because every request read the same count
before any had recorded itself; the check and the record now happen together
under a per-user lock. With that in place, eight simultaneous sends against a
limit of three yield exactly three successes.

The load test was run at 70 simulated participants, above the 60 expected on
the day: 210 messages, no errors, and the database matching the clients
exactly. Note that these numbers come from development mode on one machine,
which is slower than a production deployment.

---

## Starting over

To wipe all accounts and their data while keeping settings, terms and judge
configurations, run this in a SQL console:

```sql
DELETE FROM "user";
```

Everything belonging to those accounts is removed with them.
