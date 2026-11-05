# Build log

What is finished in each phase, and how to check it yourself. The plan for
all phases is in `SPEC.md` section 9. Newest phase last.

## When something is not working

Run the doctor. It checks the whole chain against your real database and your
real OpenRouter key, and each failing line says what to do about it:

```bash
npm run doctor
```

It reports whether the database is reachable and how far away it is, whether
the schema is up to date, whether the app can actually save a message and a
scanner result, whether every chat model answers, and whether every scanner
runs. Run it after pulling changes and again on the morning of the event.

Two failures are worth recognising on sight:

- **Scanners fail but chat works.** Almost always a migration that has not
  been applied. The database is missing a column the code expects. Run
  `npm run db:migrate`.
- **Chat and scanners both fail together.** They share one thing, the
  OpenRouter account, so look there first: credits exhausted, a key that has
  been rotated, or a rate limit. The doctor shows the provider's own words.

The round-trip time it reports is worth watching. Anything under about 15ms
feels instant. Fifty or more is what makes the interface feel sluggish no
matter what the code does, and the fix is to put the database in the region
nearest the people using it.

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

## Phase 3 follow-ups

Three issues reported after phase 3, all fixed.

- **No sign that the model was working.** Between pressing send and the first
  word arriving, nothing moved, so a slow model looked like a failure. There
  is now a "Thinking..." indicator that appears immediately and clears as
  soon as text starts arriving.
- **A model failed with an unhelpful message.** Every failure read as
  "something went wrong", which told nobody anything. The provider's own
  wording now reaches the screen, so a missing or unavailable model says so,
  and the full detail including the status code is stored on the message for
  later inspection.
- **One model was slow.** Response speed is mostly the provider's, not ours,
  and it varies a lot between models. There is now a script to measure it,
  described below.

### Checking which models actually work

Model names and provider availability on OpenRouter change over time, so the
list shipped in the code needs confirming against the live service. With your
real key in `.env.local`:

```bash
npm run check-models
```

Every model gets one tiny request. The output shows which answered, how long
each took and which provider served it, and explains any failure. Models
taking more than fifteen seconds for a one-word reply are called out, since
those will feel broken to participants.

To hide genuinely broken ones from participants:

```bash
npm run check-models -- --fix
```

To try replacement candidates without touching the stored list:

```bash
npm run check-models -- qwen/qwen3.7-plus another/model-id
```

The report separates three outcomes, which matters because they need
different responses:

- **ok** means the model answered normally.
- **note** means it was reached and responded correctly but produced no
  visible text on a short reply budget. This is normal for reasoning models,
  which spend their budget thinking before they write, and it does not
  affect ordinary chat, where replies are not capped so tightly.
- **FAIL** means the request genuinely failed, and the reason is printed.
  Only these are disabled by `--fix`.

After changing the model list in the code, load it into the database with:

```bash
npm run db:seed -- --models
```

Run this the week of the event and again on the morning, and replace anything
that fails. A model that is unavailable is better removed from the list than
left for a participant to stumble into.

---

## Phase 4 — Labeling and submitting

Status: done.

### What exists

- A labels panel beside each conversation, which can be closed to give the
  chat full width.
- The labels themselves: what kind of transcript it is, the role played and
  an optional description of it, what the participant was trying to get the
  model to do, how the model responded, and the topics covered. Under
  "optional extras": which turn the conversation pivoted on, whether the
  participant disagrees with how the model behaved, and free notes.
- A Save button for work in progress, which requires nothing, and a Submit
  button, which requires the fields the research depends on. A failed submit
  keeps whatever was already filled in rather than discarding it.
- Versioning. Each submit writes an immutable snapshot as the next version.
  The snapshot is self-contained: the messages with their full provenance,
  the labels, the scenario, the model, and the participant's profile as it
  was at that moment. A later edit to the conversation or the profile cannot
  change what was already submitted.
- Status shown in three places: the sidebar entry, a badge beside the model
  name, and the panel itself. Once a submitted conversation changes, the
  button offers the next version number.

### How to test it

1. **The panel is there.** Open a conversation. The labels panel sits on the
   right. Close it with the cross and reopen it with the Labels button.
2. **Submitting is guarded.** Press Submit with nothing filled in. Five
   messages appear, one per required field, each saying what to do. Nothing
   is submitted.
3. **Submitting works.** Fill in the required fields, pick at least one
   topic, and submit. The panel confirms version 1, a badge appears beside
   the model name, and the sidebar entry changes from Draft to Submitted v1.
4. **Your answers stay put.** After submitting, the fields still show what
   you chose. This is worth checking, because an earlier version of the form
   silently cleared them.
5. **Updating works.** Send another message, then submit again. The button
   offers version 2 and the panel confirms it.
6. **History is kept.** In `npm run db:studio` open the `submission` table.
   There is one row per version, each holding a complete snapshot. Version 1
   still contains only the messages that existed when you first submitted.
7. **Optional answers survive.** Open "optional extras", set the disagreement
   dropdown and some notes, submit, then collapse the section and submit
   again. The values must still be there. This also caught a real bug.

### Verified automatically

A browser test covers the whole path: the panel rendering, a blank submit
producing one clear message per required field, a successful submit creating
version 1, the values remaining on screen afterwards, and an update creating
version 2 with the optional fields intact even when that section is
collapsed. The stored snapshots were checked to confirm each version holds
the messages, labels and participant profile as they were at that moment.

Two bugs were found and fixed while testing. Collapsing the optional section
removed those fields from the page, so the next save wrote them away as
blank. They are now hidden rather than removed. Separately, the form lost
every answer on the second submit, because a form is reset once its action
finishes; the panel now holds its values in component state, so they
persist, and adopts the stored values when a new version is created.

---

## Interface responsiveness and a rate-limit fix

Three problems were reported after phase 4: clicking between conversations
took about a second, replies felt slow, and nothing scrolled when a message
was sent. All three are fixed, and a fourth problem was found on the way.

### What was actually slow

Measuring mattered here, because the obvious suspects were wrong. On a local
database everything was already fast, which hid the problem completely. The
real cost is that a hosted database such as Neon sits a network hop away, so
every query costs tens of milliseconds, and the pages were making roughly
nineteen of them per navigation, mostly one after another.

Simulating a hosted database by delaying the connection reproduced it:

| | Navigation between conversations |
|---|---|
| Before | 838 ms |
| After | 68 ms |

What changed:

- **The conversation is fetched before it is clicked.** Sidebar links now
  prefetch, so the data is usually already there when you click. This is the
  single biggest improvement.
- **A placeholder appears instantly.** Previously the old conversation stayed
  on screen while the new one loaded, so a click appeared to do nothing.
- **Queries that do not depend on each other now run together** rather than
  in sequence, in the conversation page, the sidebar and the chat endpoint.
- **The same rows are no longer fetched twice.** The signed-in user was read
  once by the login system and again by the application; the application's
  own fields now travel with the session. The settings and terms version,
  read on every page load but changed only by an organizer, are held briefly
  in memory.
- **The chat endpoint no longer re-reads the conversation** after saving a
  message, since it already knows what it just wrote.

Reply speed improved for the same reasons, though with a real model the
model's own thinking time dominates anything the platform adds.

### Scrolling

The view now follows new content: the message you send, the thinking
indicator, and each chunk of the reply as it arrives. If you scroll up to
read something earlier it stays put rather than yanking you back, and
sending a new message returns you to the bottom. This is how other chat
applications behave.

### The rate limit that would have broken registration

Running the load test against a production build surfaced something the
development server had been hiding: the login system enforces rate limits in
production only, and its default allows **three sign-ups or sign-ins every
ten seconds from one network address**.

Everyone at the event will share the venue's single address. Sixty people
registering in the first few minutes would have been throttled to three per
ten seconds, and most would have seen errors while trying to sign up.

The limits are now set for a room full of people sharing one connection.
What keeps strangers out is the event code, not the rate limit, and an
organizer can pause any account instantly.

This is worth repeating as a general point: test against a production build
before the event, because some protections only switch on there.

### Measured again afterwards

Seventy simulated participants, above the sixty expected, each holding a
conversation at the same time against a production build:

| Measure | Result |
|---|---|
| Replies delivered | 210 of 210 |
| Participants with errors | 0 of 70 |
| Reply time, median | 1.4 s |
| Reply time, 95th percentile | 1.8 s |

Those reply times include the stand-in provider's own streaming and exclude
real model thinking time, so treat them as the platform's overhead rather
than what a participant will feel.

---

## More interface fixes

Three further problems were reported and fixed.

- **A reply was lost when switching conversations mid-answer.** The server
  used to abandon the generation as soon as the browser went away. It now
  keeps reading the model's answer to the end and saves it, so the reply is
  simply there when the participant comes back. A generation that really is
  cut short now stores whatever text had arrived instead of discarding the
  turn.

  There was a second half to this. Because conversations are prefetched and
  cached for speed, the page could show a slightly stale list and hide a
  reply that had in fact been saved. The chat now quietly catches up with the
  server when a conversation is opened, so both the speed and the accuracy
  hold.

- **The screen went blank while a conversation loaded.** A full-screen
  placeholder was replacing the chat on every click, which was jarring. The
  conversation being read now stays on screen until the next one is ready,
  with a small spinner on the one being opened.

- **Submitted conversations are marked.** Each entry in the sidebar carries a
  dot, filled for submitted and outlined for draft.

---

## Phase 5 — Safety scanners

Status: done.

### What exists

- A **Scanners** panel, opened from the bottom of the conversation list. It
  lives outside any single conversation, so the list of results stays put as
  participants move around during the day.
- Two scanners, which behave quite differently on purpose:
  - **Llama Guard 4**, an open-weight classifier that answers only "safe" or
    "unsafe" plus hazard categories, with no explanation. Category codes are
    translated into words.
  - **An LLM judge** given a rubric, which returns a risk category, a
    severity from 0 to 10, and a short rationale.
- Results are listed newest first with the conversation they came from, and
  clicking one opens that conversation. Flagged results are marked in red,
  clean ones in blue.
- A participant sees only their own results. Nobody can run a scanner on, or
  see results for, someone else's conversation.
- Runs are limited per hour, since each one costs a model call, and the
  tokens and cost are recorded alongside chat usage.
- If a scanner itself fails, the reason is shown and the failure is recorded
  rather than silently swallowed.

### Why two different scanners

The point is for participants to see the contours of these tools rather than
trust them. A classifier that says only "unsafe, indiscriminate weapons" and
a judge that writes a paragraph will disagree with each other, and both will
sometimes be wrong about the same transcript. That disagreement is the
lesson.

### How to test it

1. **Open the panel.** Press Scanners at the bottom of the conversation list.
2. **Run both scanners on a clearly risky conversation.** Each result
   appears at the top of the list, flagged in red.
3. **Run them on a routine conversation.** The verdicts should differ
   markedly from the risky one.
4. **Switch conversations.** The panel and its results stay where they were.
5. **Click a conversation name under a result.** It opens that conversation.
6. **Check the limit.** Each participant gets a set number of runs per hour,
   adjustable per person. Past it, a clear message explains the wait.

### Testing without an API key

The stand-in provider now imitates both scanners, so the whole panel can be
exercised with no key and no spend. Point the judge configurations at the
stand-in models first:

```sql
UPDATE judge_config SET model_id = 'test/mock-judge' WHERE kind = 'llm';
UPDATE judge_config SET model_id = 'test/mock-guard' WHERE kind = 'llama_guard';
```

Remember to set them back to the real models before the event.

### Verified automatically

A browser test runs both scanners over a risky and a routine conversation and
confirms the verdicts differ appropriately, that the panel survives moving
between conversations, and that there are no console errors. Separate checks
confirm the hourly limit returns a clear message, that one participant cannot
run a scanner on another's conversation, and that they see none of each
other's results.

One flaw was found in the test harness rather than the product: the rubric
given to the judge names example categories, one of which contains the word
"bioweapon", and the stand-in scanner was matching on that rather than on
the conversation. It now reads only the transcript.

---

## Making the interface feel right

A second round of interface problems, and the fixes went deeper than the
first round because the causes were structural.

### Replies no longer vanish mid-answer

The earlier fix kept the server generating when the browser went away, which
was necessary but not sufficient. The chat itself was owned by the
conversation screen, so leaving the conversation destroyed it and cancelled
the request on the way out. If you switched quickly enough, the message never
reached the server at all.

The chat now lives in shared state that outlives any one screen. Leaving a
conversation no longer interrupts anything: the reply keeps streaming in the
background and is simply there, complete, when you return. Returning while it
is still being written shows the question and a thinking indicator rather than
a blank space.

### Everything else that felt slow

The underlying problem was that the interface had no memory. Every navigation
asked the server for things it had just been told. Conversations, their
messages, which tab was open and the scanner results now live in shared
client state, which means:

- A conversation you have already opened appears immediately, with no request.
- A new conversation is in the list the moment you create it, rather than
  after a delay.
- Submitting updates the sidebar dot, the badge and your submitted count at
  once, instead of waiting for the next page load.
- The sidebar no longer refetches after every message.

### The panel is one panel

Labels and scanners are now two tabs of the same right-hand panel, instead of
one sliding in from the right while its button sat on the left. The chosen
tab and the scanner results survive moving between conversations, and
following a result to its conversation no longer closes the panel. Labels
remain specific to the conversation you are in; scanner results span all of
them.

### Telling apart conversations that start the same way

Conversations are named after their opening line, so two that begin
identically looked identical in the scanner list. Results from the
conversation you are looking at are now marked as such, and where titles do
repeat, each carries the time its conversation started.

### Making the judge answer properly

The LLM judge kept replying with prose instead of the requested format, so
results read "Judge did not return a structured answer".

This is the difference between the two scanners. Llama Guard is a trained
classifier: answering "safe" or "unsafe" plus hazard codes is baked into the
model, so it cannot really do anything else. The LLM judge is a general chat
model that was being asked politely for JSON in its prompt, and a polite
request is one a model can decline.

The judge is now given a schema that the provider enforces, rather than a
request it may ignore. If a model still cannot comply, the answer it did give
is salvaged where possible, and otherwise the result says plainly that this
model would not answer in the required format and suggests the classifier
instead.

### A loop worth mentioning

While wiring the shared state, an effect that recorded "this conversation is
generating" caused the state to change identity, which re-ran the effect,
which recorded it again. The page locked up. Changes that alter nothing are
now ignored. It is the kind of fault that is invisible in a quick click-through
and obvious the moment anything is timed.

---

## Transcript turns, and the last of the latency

### Numbered turns

Every message now carries a bracketed number, `[1]`, `[2]`, and so on, as
transcripts conventionally do. Scanner results say which turn they judged,
so "This conversation at turn 4" points at an exact place in the exchange.
The numbering also goes into the text handed to the scanners, so a judge can
refer to a turn and the participant can find it.

### Switching conversations now makes no requests at all

Measuring what actually crossed the network during a switch found two things.

Submitting a transcript was calling for every cached conversation page to be
thrown away, so each later switch went back to the server. The panel and
sidebar now update themselves, so that is gone.

The chat was also asking the server for its messages every time a
conversation was opened, even when it already held them. It now asks only
when there is a reason: the first time a conversation is opened, or while a
reply is being written elsewhere.

| | Requests per switch | Time |
|---|---|---|
| Before | 1 | ~50 ms |
| After | 0 | ~50 ms |

The remaining time is React rendering, not waiting. First-time opens still
fetch, which is unavoidable, but those are prefetched as the links come into
view.

### No more empty bubble

An assistant message exists from the moment a reply begins, before any text
arrives, and it was being drawn as an empty bubble above the thinking
indicator. Assistant messages are now drawn only once they have something to
say.

### Clickable things look clickable

The styling reset gives buttons the ordinary arrow cursor. Anything clickable
now shows the hand.

### Why the LLM judge kept failing

It kept answering "would not answer in the required format", and sometimes
returned nothing at all. Three causes, all now handled.

The reply budget was tight at about a thousand tokens. A model that thinks
before it writes can spend that entire budget thinking, producing no visible
text, which is indistinguishable from refusing. The budget is now four times
larger.

The instructions also asked for JSON in prose while the code separately
enforced a schema, which are two different mechanisms pulling against each
other. The instructions now describe the task and leave the shape to the
schema.

Finally, there was no recovery. If the structured attempt failed, that was
the end. There are now three stages: ask with an enforced schema; failing
that, salvage any JSON from what the model did say; failing that, ask again
in plain words for JSON and parse the reply. Only if all three fail does the
result say so, and it explains that the reply budget was likely spent before
any text was written, pointing at the trained classifier instead.

This is the practical difference between the two scanners, and worth
understanding before the event. Llama Guard cannot really answer in any other
shape, because answering that way is what it was trained to do. A general
chat model is being asked, and asking is something a model can decline.

---

## Starting over

To wipe all accounts and their data while keeping settings, terms and judge
configurations, run this in a SQL console:

```sql
DELETE FROM "user";
```

Everything belonging to those accounts is removed with them.
