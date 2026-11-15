# Build log

What is finished in each phase, and how to check it yourself. The plan for
all phases is in `SPEC.md` section 9. Newest phase last.

## Why the development server feels slow, and production does not

Latency was reported three times, and measured fast all three times. The
difference turned out to be which server was being used.

`npm run dev` compiles each page the first time it is visited. Production
builds everything in advance. Measured on the same machine against the same
database:

| | Development | Production |
|---|---|---|
| First visit to Review | 1050 ms | 50 ms |
| First visit to Submit | 800 ms | 45 ms |
| First visit to a nomination form | 1310 ms | 43 ms |
| Returning to a page | 165 to 300 ms | 45 to 55 ms |

So a first click on anything in development takes about a second, and even
repeat clicks are several times slower than they will be on the day. None of
that reaches participants, who will only ever use a production build.

To see what they will see:

```bash
npm run preview
```

That migrates, builds and serves the production version on the same port. It
takes half a minute to start and is not worth using while editing, but it is
the only honest way to judge whether something is actually slow.

When judging performance, measure a production build. A development server
answers a different question.

## How much of the sluggishness is distance

The interface does as little as it can: switching to a conversation already
opened makes no network requests at all. What remains is the cost of opening
something for the first time, and that is roughly three database round trips
plus the page itself.

So the round-trip time the doctor reports sets a floor. At 1ms it is
invisible. At 48ms, which is a laptop talking to a database in another
region, those same three hops cost about 150ms before anything can render.

Two things follow, and the second matters more than it sounds:

- **Put the database in the region nearest the event.** For Boston that is
  AWS us-east-1. Creating the Neon project in the right region is the single
  largest improvement available, and no amount of code can substitute for it.
- **Measure production, not your laptop.** On the day, the application runs
  in a data centre, not on a laptop. Hosted in the same region as the
  database, those round trips fall to a few milliseconds and most of what
  feels sluggish in local development disappears. Deploy early and measure
  there before concluding anything about event-day speed.

### One optimisation that was tried and rejected

Carrying the session in a signed cookie would remove a database read from
every page load, which is the most tempting saving on a distant database. It
was implemented, measured, and reverted.

The problem is that the cached copy keeps saying an account is in good
standing after an organizer has paused it, and nothing in the request can
tell that it is wrong. Pausing a participant is a safety control that has to
take effect at once. Fifty milliseconds is not worth a pause that takes up to
thirty seconds to bite, so the session is read from the database every time.

---

## Refusals are results, not gaps

A clearly adversarial message produced nothing on screen: no reply, no
explanation. For a study about where models draw their lines, that is the
worst possible failure, because a refusal is exactly the data being
collected.

Three separate faults, all now fixed.

**The refusal never reached the browser.** When a model returns no text, the
chat library creates no message at all, so there was nothing to draw. The
turn was being recorded correctly in the database the whole time. When a turn
ends with no reply in hand, the interface now asks the server what it
recorded and shows it.

**It is now shown as a turn, with the reason.** An empty reply appears as a
numbered turn in a dashed outline saying which kind of silence it was: the
model returning nothing, a content filter stopping the answer, or the
provider blocking the request before the model saw it. Those are different
results and the distinction matters for labelling.

**The scanners failed on it.** The LLM judge reported "No output generated".
Moving to the newer structured-output call had changed which error is raised
when a model produces nothing, and only the old one was being caught, so the
fallback never ran. Both are now caught. A judge that refuses to assess a
conversation says so plainly, since a scanner declining to look is itself a
finding worth recording rather than an error.

### Llama Guard was being asked the wrong question

It kept answering "safe" about conversations that plainly were not. It was
being handed the conversation flattened into a single block of text, as
though a person had pasted a transcript and asked about it. Pasting a
transcript is a fairly harmless act, and that is roughly what it was
judging.

It is a classifier trained to read a conversation, so it is now given the
conversation itself, turn by turn, which is what it was built for. Expect its
verdicts to change, and to disagree with the LLM judge more often. That
disagreement is the point.

### Session caching, reconsidered

Caching the session in a signed cookie was reverted earlier because pausing a
participant would take up to half a minute to bite. Told that half a minute
is acceptable, it is back: most page loads no longer read the session from
the database.

Finishing onboarding still takes effect at once, because the cached copy is
re-checked against the database whenever it claims a participant cannot
proceed. The remaining cost is the one accepted: pausing someone can take up
to thirty seconds. Shorten `maxAge` in the authentication setup if that ever
needs to be tighter.

---

## Both scanners were answering the wrong question

Tested on a conversation where someone pressed repeatedly for dangerous
information and was refused every time, both scanners called it harmless. The
LLM judge said "benign, 0 out of 10" while its own written rationale
correctly described the requests. Llama Guard said "safe".

Neither model was malfunctioning. Both answered exactly what they were asked,
and the questions were mine.

**The judge was asked one question that conflates two things.** The rubric
asked how dangerous the conversation was, and since the assistant handed over
nothing, the honest answer was zero. But what the person was attempting and
what the assistant did about it are different facts, and being refused does
not make an attempt benign. A refused attempt is precisely the kind of
transcript this exercise exists to collect.

The judge now reports them separately: what the person appeared to be trying
to do, judged on their own messages alone; what the assistant did about it;
and how much real capability was actually handed over. These are the same two
axes participants label by hand, so a self-label, an independent review and a
machine judgement can be set side by side. A conversation like the one above
now reads "Adversarial request, model refused. Uplift given: 0/10."

**Llama Guard judges only the last turn.** That is what it is built to do.
Given a conversation ending in a refusal it reports "safe", which is a true
statement about the refusal and says nothing about what was asked for.

It is now run twice: once on the conversation ending at the person's last
message, asking whether that request was safe to make, and once on the whole
exchange, asking whether the reply was safe to give. Both verdicts are shown.
The same conversation now reads "Unsafe request, reply judged safe", with a
note that the classifier caught the request and passed the refusal, which is
correct behaviour rather than a miss.

That gap between the two readings is one of the more instructive things
participants can see, and it was invisible before.

> Any scanner results recorded before this are not comparable with later ones.

---

## A master index, and a review bug worth understanding

### Reviews stopped accepting labels after a refresh

Every transcript in a refreshed batch refused to be labelled, saying it was
no longer assigned. The cause is worth recording because the code read
correctly.

Refreshing a batch releases what you hold and claims a new set. That leaves
two rows for a transcript you are given again: the old released one and the
new live one. The check asked the database for "a claim by this reviewer for
this transcript" and then looked at whether it was released. With two rows
and no ordering, the database is free to return either, and it generally
returned the older, released one. So the check rejected a claim that was
perfectly valid.

The fix is to ask only for live claims rather than filtering afterwards. The
general shape of the mistake is worth remembering: taking the first row of a
query that can return several, and deciding something important from it.

### Refreshing now gives a genuinely different set

Batches were ordered oldest-first, so refreshing returned the same five.
Pressing refresh is how a reviewer says "not these", which made the button
useless. Candidates are now drawn at random, preferring transcripts this
reviewer has not already passed over, and falling back to previously released
ones only once the fresh pool runs dry.

### Claiming is one statement instead of five

A batch was claimed by inserting rows one at a time. On a database a network
hop away that was five round trips, and it was most of the delay on first
opening the review console. It is now a single statement that selects and
inserts together, which is both faster and safer: there is no longer a gap
between choosing a transcript and claiming it in which someone else can take
it.

| | First open of Review |
|---|---|
| Before | about 900 ms |
| After | about 330 ms |

Switching between the consoles measures 49 ms.

### The master index

The three consoles are reached from a column on the far left: My chats,
Review and Submit. It collapses to icons, since each console already has a
list of its own and two full-width columns crowd a laptop screen. The choice
is remembered per browser.

### A busy scanner is not a failure

Llama Guard is served by a single provider, so when that provider is busy
there is nowhere to route and the request fails. That was being reported as a
scanner error complete with provider jargon. It now says the scanner is busy,
that nothing was recorded, and to try again shortly, and it hands back the
hourly allowance so a queue does not cost a participant one of their runs.

---

## Checking who is holding which transcript

Reviewers hold a batch at a time, and refreshing releases what they held. To
see the current state, in the Neon console or any SQL client:

```sql
SELECT u.name AS reviewer, c.title, rc.state, rc.claimed_at
FROM review_claim rc
JOIN "user" u ON u.id = rc.reviewer_id
JOIN conversation c ON c.id = rc.conversation_id
WHERE rc.state <> 'released'
ORDER BY u.name, rc.claimed_at;
```

Only live rows matter. `released` rows are kept as history: they record that
someone was once offered a transcript and passed on it, which is what makes a
refresh hand out different ones next time.

To confirm nothing is held twice, this should always return no rows:

```sql
SELECT conversation_id
FROM review_claim
WHERE state <> 'released'
GROUP BY conversation_id
HAVING count(DISTINCT reviewer_id) > 1;
```

Verified directly: a reviewer refreshing three times holds exactly five at
every point, with the rest returned to the pool, and a second reviewer
claiming at the same time receives a different five.

---

## One browser holds one account

Signing in as several test accounts appeared to land on the same person every
time. Both switching paths were tested and both work: signing out and back
in, and signing in as someone else without signing out first.

The explanation is simpler and is not a fault. A browser keeps one session
cookie, shared by every tab. Signing in as a second account in one tab signs
every tab into that account. Testing several participants at once needs
separate browser profiles, or a private window per account.

Two changes make that obvious rather than puzzling. The signed-in name and
email now sit in the index on the far left, visible from every console, since
the identity belongs to the whole session rather than to one screen. And
anyone already signed in is sent away from the sign-in page instead of being
shown a form that invites the belief a browser can hold two accounts.

Signing out now reloads the page rather than navigating within the app. Next
keeps rendered pages in memory per route rather than per person, so a client
navigation could otherwise show the previous account's conversations to
whoever signs in next.

---

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

`npm run dev` now applies any pending migrations before it starts, so a pull
that adds a column no longer shows up later as a confusing query error. It
says nothing when there is nothing to do. Deployments are untouched: there
migrations stay a deliberate step.

If `npm run db:migrate` itself complains that the url is undefined, pull
again: the drizzle commands were not reading `.env.local`, which is fixed.

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

## Phase 6 — Independent review

Status: done.

### What exists

- A switch at the top of the left sidebar between **My chats** and **Review**.
- A reviewer is handed a batch of five transcripts, held for them alone.
  Nobody else can label the same conversation: the database enforces that with
  a unique index over live claims, so two reviewers asking at the same instant
  cannot both be given the same one.
- Reviews are blind. The reviewer sees the conversation, the model and the
  scenario, and is told plainly that the author and the author's own labels
  are withheld on purpose.
- The sidebar has two sections. The current batch sits at the top and
  everything already reviewed below it, newest first. Reviewing moves a
  transcript from one to the other, where the answers can still be changed
  with Submit again.
- A refresh button releases whatever is held unreviewed and claims a fresh
  set, so nothing is stuck with someone who moved on.
- Reviewing locks the transcript for its author: no further messages, no label
  edits, no re-submission.

### The lock costs nothing

The question was whether locking would mean polling the database. It does not.
The lock is a column on the conversation, read at the moment the author tries
to act, so it rides along with a query already being made. An author sitting
on a page opened before the lock gets a clear refusal when they next act,
which is the right outcome anyway.

### How to test it

Two accounts are needed, so use a second browser or a private window.

1. **As the first participant**, hold a conversation and submit it with labels.
2. **As the second**, press Review at the top of the sidebar. A batch is
   fetched and the first transcript opens.
3. **Check the blinding.** The first participant's name and their own
   description of what they were doing must not appear anywhere.
4. **Submit an incomplete review.** Five messages appear, one per required
   field.
5. **Complete it.** The transcript moves from To review to Reviewed, and the
   button becomes Submit again.
6. **Change an answer and submit again.** In `npm run db:studio` the review
   row is updated rather than duplicated, and its submission count rises.
7. **Back as the first participant**, open that conversation and try to send
   another message. It is refused with an explanation.

### Verified automatically

A two-account browser test covers the whole path and confirms the author's
name and private goal text appear nowhere in the reviewer's page, that an
incomplete review is rejected with one message per field, that a completed
review moves between the sidebar sections, that re-submitting updates the
existing row and raises its count, and that the author is then locked out.
The database was checked directly for the recorded version and the lock.

---

## Phase 7 — Self-nomination

Status: done.

### What exists

- A tracks page reached from the conversation sidebar, listing the three
  nomination-decided prizes with what each rewards.
- One entry per participant per track: a headline, the finding in detail, and
  an optional link to slides. Submitting again updates the entry rather than
  adding another, and counts the revision.
- The collaborative track also asks who they worked with. Typing offers the
  names of other participants as suggestions, without forcing an exact match.
- The tracks page shows which tracks have been entered, with the headline and
  when it was last saved.
- Nominations close either at a set time or the moment an organizer locks
  them. Closed entries stay readable: the fields are disabled and the submit
  button goes, rather than the console shutting.

### How to test it

1. Press **Put work forward** at the bottom of the conversation sidebar.
2. Open a track and press submit with nothing filled in. Each required field
   says what it needs.
3. Put something that is not a link in the slides field. It is refused with
   an explanation rather than saved.
4. Complete and submit. The button becomes **Update entry**, and the tracks
   page marks the track as submitted with your headline and the time.
5. Open the collaborative track and start typing in the collaborators field.
   Other participants' names are offered.
6. Close nominations, then reload. Your entry is still readable, the fields
   are disabled, and there is no submit button.

   ```sql
   UPDATE event_settings SET nominations_locked = true WHERE id = 1;
   ```

### Verified automatically

A browser test covers each required field, the rejection of a malformed link,
a successful submission turning into an update, the tracks page reflecting it,
and the collaborator suggestions appearing once a second participant exists.
Locking was tested separately: entries remain readable and the form cannot be
submitted.

---

## Phase 8 — Organizer console

Status: done. Reached from the far-left index, visible only to organizers.

### What exists

- **Overview.** Participants, transcripts submitted, independent reviews with
  coverage, and spend today. Transcripts broken down by type and by how the
  models responded, nominations by track, and a switch to pause chat for
  everyone.
- **Participants.** One row each, ranked by whichever prize you are judging.
  Both counted prizes are columns: benign transcripts and reviews completed.
  Also dual-use and adversarial counts, nominations, tokens used, and status.
- **Opening a participant** shows everything they produced: each transcript
  with its labels, stated goal, turn count and submission time; each review
  they wrote in full; and their nominations. Counts cannot tell careful work
  from clicking through, so this is for reading.
- **Nominations** grouped by track, each entry in full with its slides link,
  plus closing them now or at a set time.
- **Settings.** Event code, default allowance, review batch size, the model
  list, and the export.
- **Per participant**, from the table: raise their allowance, set a temporary
  password, and pause or unpause them.

### What the export contains

One line of JSON per submitted transcript, each self-contained: the
conversation, every message with the raw request and response from the
provider, the author's own labels, the author's profile, any independent
review, every submitted version, and any scanner runs. Nominations follow as
their own lines. Nothing needs joining back together later.

It streams rather than being assembled in memory, so the size of the day does
not decide whether it works.

### An organizer who signed up too early

The organizer role is granted at sign-up, from the `ADMIN_EMAILS` setting.
Someone who registered before that setting was right would have been stuck as
an ordinary participant with no way back, which is a poor thing to find out
on the morning. Re-running the seed now promotes anyone listed:

```bash
npm run db:seed
```

### How to test it

1. Make sure your email is in `ADMIN_EMAILS` and run `npm run db:seed`.
2. Sign in. The index gains **Organize**.
3. Create some activity from another account: a few transcripts with
   different types, a review, a nomination.
4. **Overview** should show those counts.
5. **Participants**, then rank by each prize in turn. The ranked column is
   emboldened.
6. Open a participant and read their work. This is the quality audit.
7. **Nominations**, then close them. A participant reloading the submit
   console sees them closed with their entry still readable.
8. **Settings**, then download the export and open it in a text editor. Each
   line is one transcript.
9. Sign in as an ordinary participant and visit `/admin`. You are sent back
   to the chat.

### Verified automatically

A browser test creates two participants, three transcripts of differing
types, a review and a nomination, then exercises every tab as an organizer:
the counts, both leaderboard rankings, the audit view, closing nominations
and a participant seeing that, and an ordinary participant being refused the
console. The export was checked for structure: four transcripts and one
nomination, each carrying the author profile, self labels, raw provider
payloads and the independent review where one exists.

---

## Round 9: naming, profiles, and forms that keep your answers

Four changes, three asked for and one found while testing them.

### Conversation names

Every chat is still named after its first message, but the name can now be
changed: click it in the header, or use the menu that appears on a
conversation in the left-hand list when the pointer is over it. Both write
to the shared client store first, so the heading and the list agree
straight away.

A name chosen by hand is no longer replaced by the first message, on the
client and on the server, so naming an empty conversation and then writing
in it keeps the name.

The chat header was rebuilt in passing. The name takes whatever width is
left and shortens with an ellipsis; the model name sits on the right with
its "fixed for this conversation" note as a tooltip. Before, with the side
panel open on a laptop, the name was squeezed to nothing while the model
name wrapped over the text beside it.

### Collaborator picker

The browser's own `datalist` dropdown is gone. Names are chips now: typing
filters the participant list, Enter or a click adds the highlighted one,
Backspace or the chip's cross removes one. A name that matches a
participant is marked, so a misspelling the organizers would have to
untangle later is visible while it can still be fixed. Anything can still
be typed, since a collaborator may be absent from the list.

The posted value is still one comma-separated string, so the action, the
schema and the export did not change.

### Profile page

Reachable from the name in the sidebar. It shows what the account has done
today — transcripts submitted, reviews finished, nominations entered, each
linking back to that console — plus the email, whether the account is an
organizer, and which terms version was accepted and when. The profile
answers can be corrected, so a role picked in a hurry at the door does not
need an organizer with database access to fix.

The questions themselves now live in one component shared with onboarding,
validated by the schema both already used.

### Forms that lost your answers

Found while testing the profile page, and older than it.

React clears a form's DOM once an action passed to `<form action={...}>`
returns, and the same for an action carried on a submit button's
`formAction`. Controlled values do not save a `<select>` from this, because
React only writes the DOM value when the prop changes, and after the reset
the prop has not.

So any form that could be rejected lost every dropdown answer while keeping
the typed text. The review form was the worst of it: leave the goal box
blank and all four dropdowns blanked out behind a plausible-looking error.
The labels panel did the same, which is the "labels form lost answers"
problem from an earlier round that making it controlled did not actually
fix.

Forms with a reject path now call their action from a transition
(`components/action-form.tsx`), which does not trigger the reset. The
labels panel has two actions, so its buttons call the one they want and the
form is read from the button that was pressed.

Also fixed: forgetting the terms checkbox saved the profile and then said
the terms "have been updated since you last accepted them", to someone who
had never accepted any.

### How to test it

1. Open a chat and click its name in the header. Rename it. The list on the
   left changes at the same moment. Reload; it is still there.
2. Hover a conversation in the list, use the three dots, rename it there.
   Type a name with spaces in it — the click must not follow the link.
3. Start a conversation, rename it before writing anything, then send a
   message. Your name survives.
4. On the collaborative nomination track, type a few letters of another
   participant's name, pick them with Enter, then add a name that is not on
   the list. Remove one with its cross and one with Backspace.
5. Click your name at the bottom of the sidebar. Check the counts against
   what you have done, change your affiliation, and save. Your name in the
   sidebar changes too.
6. In the review console, fill in everything except the goal box and
   submit. You get an error and keep every answer. Fill the box in and
   submit for real.
7. Same in the labels panel: answer two questions, press Submit, get the
   error, and check nothing was lost. Save still works on its own.

### Verified automatically

Browser tests cover each of the above against a production build: renaming
from both places and the name surviving a reload and a later message; the
picker's filtering, keyboard use, free text, both ways of removing a chip,
and the value surviving a submit and reload; the profile page's counts
against the same numbers read straight from SQL, an edit saving and showing
in the sidebar, and a rejected save keeping every field including the
selects; the same rejected-then-completed path for the review form, the
labels panel and a nomination.

---

## Round 10: what a code review found

A review of the whole build, read for the three things this app has got
wrong before: who can do what, what happens when two people act at once, and
whether the dataset says what happened. Ten findings, all fixed, plus one
more that turned up while testing the fixes.

### Two ways in that should not have existed

**Organizer by email.** Any new account whose address was in `ADMIN_EMAILS`
became an organizer at sign-up. Addresses are not verified, so the role went
to whoever registered a listed address first, and two listed addresses had no
account. An organizer can export every transcript with its author's details
and set anyone's password. Nothing grants the role at sign-up now: an
organizer promotes from the participants table, and the seed promotes listed
accounts that already exist, which is how the first one comes about.

**Event code.** It was checked by the sign-up page before creating the
account, and not by the endpoint that creates it. Posting to that endpoint
directly made an account with no code. The endpoint now requires it.

### Three ways the dataset could be wrong

**Reviews of the wrong version.** Reviewers saw the live conversation, which
the author can keep adding to after submitting, and the review was recorded
against whatever version existed at the moment they pressed submit. They now
read the submitted snapshot, and a review is refused if a newer version has
appeared in the meantime; the new one loads beside the answers already
entered.

**Labels that changed without a version.** The labels row is a working copy.
The leaderboard, the overview and the export read it as though it were what
had been submitted, so relabelling a submitted transcript and pressing Save
moved it between prize columns. Counts come from the submitted snapshot now.
The export has the submitted labels as `self_labels` and the working copy as
`draft_labels`.

**A blind review that was not.** The review list showed each transcript's
title, and titles can now be renamed to anything. It shows the start of the
first message instead.

### Five things that would have gone wrong on the day

- **The deadline.** A closing time of 15:00 read back to the organizer as
  20:00 and moved five hours later each time it was saved again; participants
  were shown "8:00 PM". Every time is now in Boston time and says so.
- **Refusals ended conversations.** An empty reply was sent back to the
  provider in the next prompt, and some providers reject an empty message, so
  a conversation could not continue past its first refusal.
- **Replies lost when a tab closed.** The server kept reading the reply but
  did not tell the host it was still working. Needs watching on the deployed
  site; it cannot be reproduced locally.
- **New terms looped.** Accepting a newly published version sent people back
  to accept it again for up to half a minute.
- **An allowance of zero.** Typing the allowance the way the console displays
  it, with commas, stored zero for everyone.

### Found while testing

After a successful submit the labels form went blank, and submitting again
was refused for empty fields. The form was being rebuilt from the labels the
page first loaded with, and that page is cached in the browser. The working
copy now lives in the client store with the messages, so it also survives a
visit to the scanners tab or to another conversation.

### Smaller things

Refused requests no longer use up a send or a scanner run. Paused accounts
can no longer save labels, submit, or reach the organizer console. The
cleanup SQL now unlocks transcripts whose reviewer was deleted. Three
identical page layouts and three copies of an env-file reader are one each.

### How to test it

1. Sign out, and try to create an account with a wrong event code. Then, if
   you are comfortable with `curl`, post to `/api/auth/sign-up/email` with no
   `x-event-code` header: it is refused.
2. In the organizer console, set nominations to close at 15:00. Reload: the
   field still says 15:00, and the line under it says "3:00 PM EST". The
   participants' page says the same.
3. Submit a transcript, then add a message and rename the conversation. From
   another account, open it for review: you see the submitted turns only, and
   the list shows its first message, not the new name.
4. With that review page open, resubmit as the author, then submit the
   review. You are told it changed, the new version loads, and your answers
   are still there.
5. Submit a transcript as benign, change the type and press Save. The
   participants table still counts it as benign.
6. In Settings, type the allowance as `5,000,000` and save; then try `abc`.
7. Submit a transcript and look at the labels form: it still holds your
   answers, and says "Submitted as version 1".

### Verified automatically

Each of the above against a production build, with an author and a reviewer
in separate browsers acting at the same time; the time handling with the
machine set to UTC, Los Angeles and Tokyo and a browser on Tokyo time; the
counts and the export read back after changing the working copy under a
submitted transcript; and the prompt sent after a stored empty refusal.

---

## Round 11: dropdowns of our own, and tests that live in the repository

### Dropdowns

Every dropdown is now the app's own: the five profile questions, five in the
labels panel, four in the review form and the scanner picker. The browser's
`<select>` opens the operating system's menu, which looked different on every
machine and like none of them belonged here.

Replacing it means taking on what it did for free, so the new one
(`components/ui/select.tsx`) follows the standard pattern for this control:

- **Keyboard.** Arrows, Home and End, Enter or Space to choose, Escape to
  back out, Tab to move on taking the highlighted option along, and typing
  to jump to an option by its first letters.
- **Screen readers.** It announces itself as a combobox, whether it is open
  and which option is current, and takes its name from the field's label.
- **Forms.** It posts with its form through a hidden input.

The menu is drawn at the top of the page rather than inside the side panel,
where it would be cut off at the panel's edge, and opens upwards when there
is no room below.

One behaviour changed: the browser no longer blocks a form with an empty
dropdown before it is sent. The server's own message appears under the field
instead, which is the same wording for every field and every browser.

### Tests in the repository

Until now every browser check was a script written for the occasion and
thrown away. The dropdown change broke all of them at once, since each drove
forms through the old control, so this round's were written to stay.

`e2e/` has 21 Playwright tests in six files: getting in, the dropdown
itself, a transcript from first message to second version, independent
review, nominations and the organizer console. Several are the scenarios
from the code review, kept so those fixes cannot quietly come undone: the
event code enforced by the endpoint, a review tied to the version read, the
blind review showing nothing of the author's, the closing time from a laptop
on Tokyo time, and the allowance typed with commas.

They drive a production build in a real browser. Model replies come from the
stand-in provider, so nothing is spent and no model needs to be up.

### How to test it

1. Open any form and use a dropdown with the mouse, then with the keyboard
   only: Tab to it, arrow down, type a few letters, Enter.
2. In the labels panel, open the last dropdown with the window made short.
   It opens upwards rather than off the screen.
3. `npm run test:e2e`, after the one-time setup in the README.

---

## Round 12: checks that run by themselves

Until now the only thing that ran automatically was Vercel's build, which
catches a change that does not compile and nothing else. The browser tests
from round 11 existed but only ran when someone remembered to.

### What was added

**`.github/workflows/ci.yml`**: one GitHub Actions job on every push to any
branch. It installs, lints, typechecks, starts an empty Postgres, creates
the tables and seed data, builds for production, and runs all 21 browser
tests. No secrets are involved: replies come from the stand-in provider and
the database is thrown away at the end. A failing run keeps its report, with
a screenshot and a step-by-step trace per failed test, for a week.

**`docs/TESTING.md`**: what each kind of check is for, how to run the
browser tests yourself, which database they use, what they cover and what
they do not, how to add one, and how to read a failure.

**`scripts/e2e-prepare.mjs`** now says when its database address came from
the environment, which is the case in CI, instead of claiming it was read
from `.env.local`.

### How it was checked before being pushed

The whole job was rehearsed locally first, in the same mode CI uses: a
database created empty, migrated from nothing, seeded from environment
variables alone, then the full suite against a fresh production build.
Migrating from nothing had not been exercised since the first week; every
database since had been migrated one step at a time.

### The first run

Passed on GitHub in 3 minutes 7 seconds: lint, typecheck, an empty database
migrated and seeded, and all 21 browser tests green. It raised one warning,
that two of the standard actions it used were built for a retired version
of Node, and those were moved to their current versions straight after.

### What it does not do

It reports; it does not block. Vercel publishes `main` on every push whether
or not this has passed. Making a red run stop a merge needs changes to
arrive by pull request and `main` to require the check, which is a
repository setting only the owner can change. The steps are in
`docs/TESTING.md`.

---

## Round 13: sign-up checks, terms you can publish yourself, and more tests

Three things from the to-do list that needed nothing from the team, each
with tests, plus one thing the tests turned up.

### Sign-up checks

There is no email on the day: no confirmation message to bounce and no reset
link. So an address typed wrong is an account its owner cannot find again,
and a forgotten password means finding an organizer.

- **Email.** The browser's own check accepts `name@host`. Sign-up now wants
  a real-looking address, with a dot and letters after the @.
- **Typos.** `gmial.com`, `gmail.con`, `harvard.ed` and their relatives get
  a "Did you mean ...?" under the field that fixes the address when clicked.
  It asks and does not insist, because plenty of real domains look like
  typos of better-known ones.
- **Passwords.** Three rules, shown under the field and ticked off as they
  are met: at least 8 characters; a letter and a number; not your own name,
  your email, the word "astral", or one of the passwords everyone tries.
  No demand for symbols or capitals, which mostly produces `Password1!`.

The form checks first to save a round trip, and the server checks again and
decides (`lib/credentials.ts` is the one definition both use). A temporary
password set by an organizer is held to the same rules.

Accounts that already exist are not affected. In particular the weak
organizer password from testing still works until it is changed.

### Publishing terms from the console

**Organize → Terms.** A box that starts from the text in force, a preview
beside it showing what participants will see, and a publish button that
asks once before it acts and says how many people it will interrupt.

Replacing the placeholder terms used to mean an `INSERT` in a SQL console.
That was the first item on the blocking list and the one most likely to be
done in a hurry.

A published version is never edited. People agreed to that exact text, so a
correction is a new version, which asks everyone to accept again. Every
version is listed underneath, with a count of how many accounts have
accepted the current one.

### Tests

Seven more, 28 in all:

- a weak password refused, with the reason on screen;
- the server refusing the same things as the form when the form is skipped;
- a mistyped email questioned and corrected;
- regenerating a reply replacing it instead of adding one;
- pausing chat for everyone, seen from a participant's side, and resuming;
- closing nominations by hand, and reopening;
- publishing new terms, and a participant being asked to accept them once
  and not again.

The last three had only ever been checked by hand.

### What the tests turned up

**Pausing chat is not instant.** A participant's message sent a moment
after the organizer pressed Pause still got an answer. The app remembers the
event settings for ten seconds instead of reading them on every message,
which is deliberate and is most of why pages feel quick, but the console
said nothing about it. It now does: "Stops new messages for everyone within
about ten seconds."

**The load test's own password broke the new rules.** Its accounts are
named "Load 0" and used `loadtest12345`, which contains the account's own
name. All seventy sign-ups were refused. The rule was right and the test
data was stale; it has a different password now. Worth recording because it
is the suite doing its job: a change in one place caught by a check in
another before it reached the site.

### How this round reached the site

The first round under the new rule: pushed to the working branch, CI run
there, and `main` moved forward only once that run was green.

### How to test it

1. Sign out and start creating an account. Type an address ending
   `@gmial.com`, and a password of `astral2026`.
2. As an organizer, open **Organize → Terms**, change a word, and look at
   the preview. Publish only if you mean it: it cannot be undone and it
   interrupts everyone.
3. Pause chat from the overview, wait ten seconds, and try to send a
   message from another account.

---

## Round 14: a deploy gate, tested

The owner switched on Deployment Checks in Vercel, which holds a new
version back until CI has passed on its commit. This round was about
finding out whether it does.

### Knowing what is live

There was no reliable way to tell which commit the site was serving; it had
been done by loading a page and looking for text a change happened to add.
Every page now carries its commit in a `<meta name="astral-build">` tag, and
**Organize → Settings** shows it. Three tests for the front page came with
it, which had none, making 31.

### The test

A commit was pushed to `main` containing one test that always fails and no
change to the application, so that if the gate did not work the site
published would behave exactly as before.

- The push before it, which had already passed CI, went live in 41 seconds.
- The failing commit's CI run failed after three minutes.
- Seven minutes after the push, the site was still serving the earlier
  commit.

The failing test was then removed, by the usual route: branch, CI, `main`.

### What this means in practice

A change that breaks a test can no longer reach participants by being
pushed to `main`. It also means the site can fall behind `main` on purpose,
and **Organize → Settings** is where to see that it has.

One thing to keep in mind: the check is matched by the name of the CI job.
Renaming the job without renaming the check in Vercel would leave every
deployment waiting for a check that never reports.

---

## Round 15: a second review

A second review of the whole diff found ten things. All ten are fixed, each
with a test where a browser can show it.

### In the running app

- **The wrong reason when terms change.** After new terms were published, a
  participant who pressed Submit or sent a message was told "Finish your
  profile first", with no way to the terms. One function, `whyBlocked` in
  `lib/gate.ts`, now gives the reason and the chat shows a link to the terms.
- **Pausing chat really is immediate now.** Round 13 recorded that a pause
  took up to ten seconds and put a note in the console. The real cause was
  that the production build gives pages and the chat endpoint separate
  copies of the remembered settings, so clearing one did not clear the
  other. The store is now shared (`lib/cache.ts`), the note is gone, and
  two ten-second waits came out of the tests.
- **A conversation after an empty reply.** Dropping an empty reply from what
  is sent to the model left two participant messages in a row, which some
  hosts of open-weight models refuse. Consecutive messages from the same
  side are now merged (`lib/prompt.ts`).
- **The export says which messages were submitted.** A transcript's export
  line carried every message, including ones added after the last submit,
  next to labels and a review that describe only the submitted ones. Each
  message now has `in_submitted_version`, and the line has
  `submitted_message_count`.
- **A closing time in the past is refused**, instead of quietly closing
  nominations on the spot.

### In the dropdowns

- Clicking one now gives it the keyboard on Safari and Firefox on a Mac,
  which do not focus a button when it is clicked. Typing to jump to an
  option and Escape to close did nothing there before. I cannot run Safari
  here, so this one is fixed by reasoning and checked in Chrome only.
- A screen reader is now told when a dropdown is required, when it is the
  one in error, and what the error says.

### Around the tests and the seed

- **The tests cannot run against production.** They refuse the database in
  `.env.production.local`, and refuse any database that has not been
  prepared with `npm run test:e2e:prepare`, which leaves a marker table
  behind (`scripts/e2e-guard.mjs`). Before this, a production address left
  in a shell variable would have had nominations reopened and chat unpaused
  by the first line of a test run.
- **Running the seed again no longer undoes settings.** It used to put the
  allowance and rate limits back to the values in the code, and it is the
  documented way to promote the first organizer. Limits are now left alone
  unless you pass `--limits`, and the model list unless you pass `--models`.
- **The tests always build afresh.** Locally they would use whatever was
  already answering on the port, which after an interrupted run meant
  yesterday's build.

### How to test it

1. As an organizer, pause chat, and send a message from another account
   straight away. It should be refused at once.
2. Set a nominations closing time with yesterday's date. It should be
   refused, with the reason.
3. Download the export and look at one transcript's `messages`: each has
   `in_submitted_version`.

---

## Round 16: Colby's feedback, a shorter front page, a new look

### The scenario box is gone

A new conversation asked for a model and, optionally, a scenario that was
sent to the model ahead of the conversation. It now asks only for a model,
and says so: "Each model starts as it normally would, with nothing added on
our side."

The conversations already had with a scenario keep it. It is still shown
above those conversations, still sent to the model if they are continued,
still shown to reviewers and scanners, and still in the export, because it
is part of what the model was responding to. There is just no longer a way
to set one. A request that sends one anyway (a tab left open from before)
has it dropped, not refused.

### Newer models

The list in `lib/models.ts` was a few months stale. It was rebuilt from
OpenRouter's public list on 11 November 2026, taking the newest
general-purpose models in each family:

| Family | Models |
|---|---|
| Anthropic | Claude Fable 5.2, Claude Opus 5.5, Claude Sonnet 5.5 |
| OpenAI | GPT-6 Astra, GPT-6.1 Sol, GPT-6.1 Terra |
| Open weight | Muse Spark Open, Qwen3.8 2.4T, Kimi K3.1 Pro, Muse Glimmer 30B |

Three things I decided that you may want to overrule:

- **DeepSeek is not in it.** OpenRouter's listing does not describe its
  current models as open-weight, and that heading is a claim the dataset
  will carry. Add one if you know its weights are published.
- **The scanner still runs on Claude Sonnet 4.5.** Changing the judge
  changes its verdicts, and that is a research decision, not housekeeping.
- **I have not sent these models a message.** The ids come from the public
  list, which needs no key. Whether your account can reach each one is what
  `npm run prod:check-models` answers.

**The live site does not pick this up by itself.** The list in use is a row
in the database; the code only holds the starting list. To take the new
one, either:

- open **Organize → Settings**, where a box now appears whenever the two
  differ, saying what would be added and removed, and press **Switch to the
  new list**; or
- run `npm run prod:seed -- --models`.

Then run `npm run prod:check-models`. Removing a model means conversations
already started on it cannot be continued, so do this before the event.

### A shorter front page

The front page was the whole briefing. It is now the name, three sentences,
the two buttons and the models on offer. Everything from "Why we are doing
this" down has moved out of it and lives only at **How it works** in the
sidebar, once someone is signed in.

### A new look

Modelled on LM Arena's site as far as I could: I could not open it from
here, so this follows what is published about its design, which is a serif
for headlines over a plain sans for everything else, on a quiet background.

- **Serif headings.** Page titles, section titles and the wordmark are in
  Newsreader. Body text, forms and the chat stay in the sans they had,
  because long forms and dense panels are harder to read in a serif.
- **One accent: sage.** `#4f6b51`, used for the main button on each screen,
  links, ticks, focus rings and the participant's side of a chat. The blue
  is gone and so is the black button. Red remains, only for errors and for
  things that cannot be undone.
- **A warm paper background** in place of the near-white.

The sage is darker than the pale grey-green the word might suggest. It has
to be: it is used for text and behind white text, and a lighter one fails
the usual contrast standard (4.5 to 1). This one measures 5.5 on the page
and 5.9 under white text. All of it is five lines at the top of
`app/globals.css` if you want a different shade.

### Tests

Three more, 36 in all: the front page has no briefing and the signed-in
page has all five prizes; a new conversation offers no scenario and drops
one that is sent anyway; switching to the new model list from the console.

`npm run test:e2e:prepare` now gives the test database the model list in
the code, so the tests run against what participants will be offered.

The load test, seventy people sending three messages each against the
stand-in provider: 210 of 210 replies, no errors, slowest 1.6 seconds.

### Not done, on purpose

The rest of that conversation with Colby is still being decided, so none of
it is built: the reworded labels (I cannot read the Google doc from here), a
free-text field for "Other" topics, and campaigns as folders. They are in
[TODO.md](TODO.md).

### How to test it

1. Open the site signed out. One screen, no prize table.
2. Sign in and start a new conversation: a model, and nothing else.
3. **Organize → Settings**: the box offering the new model list. Press it,
   then run `npm run prod:check-models`.

---

## Round 17: three things from using it

### The buttons beside each participant

In **Organize → Participants**, pressing Manage opened the controls inside
the last cell of the table, which is only as wide as the word "Manage". The
boxes and buttons were squeezed until "Set allowance" and "Set password"
wrapped onto two lines and spilled out of their buttons.

The controls now open as a row of their own under the participant, across
the full width of the table, with everything on one line. The Manage button
turns into Close while they are open. On a narrow window, where the table
scrolls sideways, the controls stay within what is visible.

Buttons everywhere also no longer wrap their label, whatever they are
squeezed by.

### Closed nominations look closed

Closing nominations already stopped entries being saved. What it did not do
was look like it: the page was the same form with its boxes greyed out, the
notice was one quiet line, and the introduction still said entries could be
changed. Worse, someone who already had the page open saw no change at all
until they navigated.

Now, under **Submit**:

- A clear notice at the top: "Nominations are closed", and what that means
  for this person.
- An entry is shown as plain text, the way the organizers have it. There is
  no form and nothing to type into.
- A track that was never entered is no longer a link.
- **A page left open closes by itself.** It checks every fifteen seconds,
  whenever the tab is returned to, and at the closing time if one was set.
  Anything half-typed and not saved is shown underneath, marked as not
  submitted, so nobody loses a paragraph without being told.

This applies however nominations closed: by the button, or by the closing
time passing.

### How it works comes first

**How it works** is now the first item in the sidebar, above My chats. I
read "put it at the top" as the sidebar; if you meant something else, such
as moving a section within that page, say so and it is a one-line change.
Signing in still lands on My chats.

### Tests

No new tests, but two got longer. The nominations one now has a participant
with the form open and something half-typed when the organizer closes, and
checks they see it close, see their entry as text, and are told what was
not saved. The organizer one checks each control's label is on one line and
inside the table.

### How to test it

1. **Organize → Participants → Manage** on anyone.
2. Open **Submit** in one browser as a participant and start typing an
   entry. In another, close nominations. Click back into the first.

---

## Round 18: seven things for the data

**This round changes the database.** Before it goes live, run
`npm run prod:migrate`. The site does not work on the new code without it.

### Transcripts that are never submitted

They were already being kept. Every message is saved the moment it is sent,
in the same tables as everything else, whether or not its author ever
presses Submit. What was missing is that the export left them out.

They are now in the export, one line each like any other transcript, marked
`"status": "draft"`, with whatever labels the author had filled in under
`draft_labels` and nothing under `self_labels`. **Organize → Settings** has
a second download, "Submitted transcripts only", for when you do not want
them. A conversation that was opened and never typed into is not exported.

On a separate database: I would not. The thing that makes a transcript
"incomplete" is one column, and it changes the moment the author submits. A
second database would mean moving rows between two places at that moment,
and two places to back up and export from, to gain nothing that the column
does not already say.

### Copy and paste

Copying, cutting and pasting inside a conversation is recorded: which of the
three, where on the page (the message box, a particular message, the labels
form, the review form), how many characters, and the text itself up to
4,000 characters. The same on the review page.

- It is in the export, on each transcript's line, as `clipboard_events`.
- An organizer sees a summary beside each conversation: "Pasted into the
  message box 2 times, 1,240 characters in all".
- It never blocks or changes anything. The clipboard behaves as it always
  does; the page reports what happened afterwards and does not wait for an
  answer.

Two things you should know:

- **I added a sentence saying so** to the briefing under "What happens to
  what you write". Recording this without telling people is the kind of
  thing a review board minds. **The terms should say it too**, and that is
  your text to write.
- It records pastes into the page and copies out of it. It cannot know
  where a paste came from or where a copy went.

### Free text behind "Other"

Choosing "Other" now opens a box asking what was meant, and the answer is
required: "Other" on its own is the one answer nobody can use afterwards.

- **Intake form**: role, highest degree, primary background, and
  life-science subdomains.
- **Labels**: the "Other" topic gets its own box. For the role, the existing
  "Describe that role" box becomes required when the role is "Other".

On whether it is a good way to collect data: yes, for exactly the purpose
you gave. The fixed list stays countable, and the free text catches what the
list missed. The cost is that someone has to read those answers afterwards
and sort them, and the most useful thing to do with them is add the common
ones to the list for next time. The box only appears for people who choose
"Other", so everyone else's form is no longer.

### Choosing the turns that are evidence

The labels panel has a new question, "Which turns show it?", with a
**Select turns** button. Pressing it puts the conversation into a mode of
its own:

- every message gets a tick box beside its number, and the whole message is
  the thing you click;
- the message box is replaced by a bar saying what to do and what is marked
  so far ("2 marked: turns 2 and 3"), with **Clear** and **Done**;
- clicking a turn again unmarks it; Escape or Done leaves.

Afterwards the marked turns keep a small bookmark beside their number, and
the labels panel lists them as chips that can be removed one at a time.

This replaces the old "Where did the conversation turn?" dropdown, which
allowed one message and was hidden under Optional extras. Answers given to
the old question are kept in the database.

Submitting records the marks twice: as turn numbers on the labels, and as
`evidence: true` on the messages themselves in the snapshot, so nobody has
to match numbers to messages later. The export has `marked_as_evidence` on
each message.

### Up to two reviewers per transcript

A transcript can now be reviewed by more than one person. The limit is
**Reviews per transcript** in **Organize → Settings**, and starts at 2.

- A batch is drawn at random from transcripts that are under the limit and
  that this reviewer has neither reviewed nor is holding. Nobody reviews
  the same transcript twice, and nobody is shown anyone else's review.
- The limit counts people holding a transcript as well as people who have
  finished, so it cannot be exceeded by two batches crossing.
- Lowering the limit keeps the reviews already made.
- The first review still locks the transcript for its author, as before.
- The export has `independent_reviews`, a list, where it had
  `independent_review`.

One thing I did as you asked but would think about: the draw is purely
random, so with a limit of 2 some transcripts will collect two reviews
while others have none. If you would rather every transcript got one review
before any gets a second, that is a one-line change to the ordering.

### No collaborative prize

Gone from the nominations page, the briefing (now four tracks, two decided
by nomination), the organizer's console and the form that asked who you
worked with. `/nominate/collaborative` is a 404.

Entries made in that track while it existed are not deleted. They are no
longer shown anywhere in the app, and they are still in the export.

### A participant's whole history in the console

**Organize → Participants → a name** used to list each conversation as one
line. It now shows every conversation in full, newest first, with:

- every message as plain text, exactly as written (long ones are cut short
  with a "Show all" link, so the page can still be scrolled);
- beside it, the labels: as submitted for a submitted conversation, "so
  far" for one never submitted;
- the turns marked as evidence, outlined;
- messages added after submitting, greyed and marked as not part of it;
- what each reviewer said about it;
- the copy-and-paste summary.

**All / Submitted / Not submitted** at the top filters it, with counts.
**Open all / Close all** folds the conversations to their headings.

### Tests

Six more, 42 in all: "Other" on the intake form; marking evidence turns by
mouse and keyboard; "Other" as a topic or role; copy and paste being
recorded (and refused for someone else's conversation); two reviewers on
one transcript, including three people asking at once; and the history page
with its filters and both exports. The nomination test was rewritten for
the two tracks that remain.

Load test: 210 of 210 replies, no errors.

### How to test it

1. Start a conversation, exchange a few messages, press **Select turns** in
   the labels panel and click some.
2. Paste something into the message box, then open that participant in the
   console.
3. In the profile, change your role to "Other".
4. **Organize → Settings**: "Reviews per transcript", and the two
   downloads.

---

## Round 19: after a guessed password

A tester guessed an organizer's password, signed in, and set new passwords
for everyone else. This round is about that, in the order it would have
stopped it.

**This round changes the database.** Run `npm run prod:migrate` before it
goes live. The migration only adds things, so it is safe to run while the
current version is still serving.

### What went wrong

- The password was `astral123`. Sign-up has refused passwords like that
  since round 13, but the account was older than the rule, and nothing
  looked at existing passwords.
- Nothing slowed down or noticed repeated wrong guesses.
- Once in, an organizer account could do anything, and nothing recorded
  what it did.
- Setting someone's password left them signed in, so there was no way to
  put an intruder out.
- There was no way to change your own password at all.

### What changed

**A weak password is caught at the next sign-in.** Signing in is the one
moment the password is in hand, so that is where it is checked against the
current rules. If it fails, the account goes to a page that asks for a new
one, and nothing else works until it is given: no pages, no messages, no
console.

(Round 20 changed this: a password anyone could guess is now refused
outright, and only the less guessable failures get this page.)

**Organizers need twelve characters.** Participants still need eight. An
organizer account can set passwords, promote people and download every
transcript, so its password is worth more to guess. Making someone an
organizer signs them out, so the rule is applied when they sign back in.

**Wrong guesses lock the account.** Eight wrong passwords in a row lock an
account for five minutes, during which even the right password is refused.
It is counted per account, because everyone at the event shares one network
address and a limit by address cannot tell a guesser from the room. An
organizer setting a password lifts the lock.

**You can change your own password**, from your profile. It asks for the
current one, and signs the account out everywhere else.

**A password set by an organizer is temporary.** It signs the account out
wherever it is signed in, and works once: the person is asked to choose
their own on signing in. Organizers cannot set their own this way.

**Sign everyone out.** One button under **Organize → Activity**, for when
it is not clear who is still signed in with what.

**Everything an organizer does is recorded.** **Organize → Activity** lists
it, newest first: passwords set, people promoted or paused, settings
changed, terms published, every download of the export, and who did each.
It also shows accounts locked for wrong guesses and accounts caught with a
password that had to be replaced.

**The console checks every time.** Organizer pages and actions no longer
trust the copy of the session a browser carries for half a minute. Being
demoted, paused or signed out shuts the console at once.

### What the tests turned up

Ending a session on the server did not end it in a browser that was already
signed in: for up to half a minute the browser's copy still said it was
signed in while the server said it was not. Going to the sign-in page in
that window sent the person to the app, which sent them back, round and
round. That was there before this round and would have hit anyone whose
password an organizer had just set. The sign-in and sign-up pages now ask
the server.

### What it does not do

- **Signing out reaches participants within half a minute, not instantly.**
  The console is exact; ordinary pages keep the short-lived copy, because
  it is what makes them quick.
- **It cannot contain an organizer account that has been got into.** Any
  organizer can still demote another. What it can do is make getting in
  hard, make it visible afterwards, and give you the means to end it.
- **No second factor.** A code from a phone app for organizer accounts is
  the next step up, and the only thing that protects against a password
  that is strong but known. Not built; see [TODO.md](TODO.md).
- **A locked account can be locked again.** Someone who knows an
  organizer's address can keep it locked by guessing. An organizer who is
  already signed in is not affected, and another organizer can lift it.

### Tests

Five more, 47 in all: a weak password having to be replaced; an
organizer's needing to be longer, and rights removed taking effect at once;
wrong guesses locking an account and an organizer letting its owner back
in; changing a password signing out another browser; signing everyone out.

### How to test it

1. Sign in. If your password is the old one, you will be asked for a new
   one before anything else.
2. **Organize → Activity**.
3. In a private window, try eight wrong passwords for a test account.

---

## Round 20: a third review, mostly of round 19

A review of the last two rounds found fifteen things. Three of them meant
the sign-in work in round 19 did less than it said. All fifteen are fixed.
No change to the database this time.

### Three that undid round 19

**The login library had an administration API of its own, wide open.** It
answers on `/api/auth/admin/...` and can set anyone's password, change
anyone's role, sign in as anyone and delete anyone, for any organizer's
session. None of it went through the console's checks or the activity
record, so someone with an organizer's cookie could have done everything
the tester did and left no trace. Those addresses, and the library's own
change-password address, now answer "not found" to a browser. The app's
own actions are the only way in.

**Making a weak password "work once, to choose a new one" gave the account
to whoever tried it first.** Round 19 caught a weak password at sign-in and
asked for a replacement. But the person asked is the person who just typed
it, and if that is the guesser, they choose the replacement and keep the
account, console and all.

So a password that anyone could guess is now refused at sign-in without
being checked, right or wrong: under eight characters, on the list of
common ones, or built on an obvious word such as the event's name. The
owner of such an account needs a temporary password from an organizer, or
from the command line (below). Passwords that fail the rules in ways a
stranger would not guess (built on the owner's own name, or too short for
an organizer) still get the replace-it-now page, since the person holding
one is almost certainly its owner.

**The lock could be outrun.** Wrong guesses were counted after the password
was checked. A hundred sent at once were all let through before the first
was counted. Each attempt is now counted before its password is looked at,
one at a time, so the limit holds however they arrive.

### A way back in without the console

```bash
npm run prod:set-password -- someone@example.com
```

Makes up a temporary password, prints it, signs that account out
everywhere and lifts any lock. It needs the database credentials, so only
you can run it. This is what to do if an organizer's password is one the
site now refuses and there is nobody else to ask.

### The other twelve

- **Reading was not blocked where writing was.** A paused account, or one
  that had to replace its password, could still fetch its conversations and
  scanner results. Those now refuse in the same states.
- **A label answer over its length limit crashed the submit** instead of
  naming the box. The boxes now stop at the limit, and the server says
  "Keep this under 4,000 characters" beside the right one.
- **Exported clipboard events did not say whose they were**, so a
  reviewer copying from a transcript looked like its author doing it. Each
  now has `by` (`author` or `reviewer`) and `user_id`.
- **The organizer's history page showed the conversation as it is now, not
  as submitted.** A reply regenerated after submitting hid the reply that
  was actually submitted. It now shows what was submitted, then anything
  added since, and says of a regenerated reply which turn it replaced.
- **Regenerating a reply that was marked as evidence kept the mark** on
  whatever came back. The mark now goes with the reply, on screen and in
  what was saved.
- **A download cut short looked complete.** The export now ends with a
  line `{"record": "end", ...}` carrying the number of transcripts, and is
  given the longest running time the platform allows. No end line means
  download it again.
- **The current password could be guessed at without limit** on the
  change-password form. It now draws on the same eight attempts as signing
  in. Other failures there are no longer reported as a wrong password.
- **A paused account signing in with the right password was counted as
  guessing**, and eventually told "too many wrong passwords". Only a wrong
  password uses up an attempt now.
- **An organizer could pause their own account** and be shut out of the
  console. Refused, like changing your own role.
- **Organizers promoted by the seed script stayed signed in**, so the
  twelve-character rule never reached them. The seed now signs them out,
  as the console does.
- **Each later review moved the time a transcript was locked.** It is now
  the time of the first.
- **Text dragged into the message box was not recorded.** It is, as
  `drop`.

### What the tests turned up while fixing

- The first version of the lock-time fix could not be sent to the database
  at all, and every review failed. The existing review tests caught it.
- The "what were you trying to do" box had no length limit on submit, only
  on save. It has one now.

### Tests

Five more, 52 in all, and several longer. New: a guessable password
refused even when right, with the command line as the way back; forty
guesses at once not getting past the limit; a paused account not being
counted as guessing; the change form's limit; an over-long label answer.

---

## Round 21: specification v1.1

The research design was rethought from first principles and written up as
`docs/spec/ASTRAL_Hackathon_Central_Spec_v1.1.html`. This round rebuilds
the data collection around it. `docs/SPEC-V1.1-STATUS.md` maps every
section of the specification to what was built, changed or left out, and
lists the decisions that need the organizer's eye. This entry is the
shorter story of the change.

### What a participant now does

- **Joins** by agreeing to the study information (two required
  agreements, one optional answer about public release) and answering
  form A: subject areas from a fixed list, role, kinds of work, what they
  could assess in up to three areas (F0 to F3), biosafety and biosecurity
  experience, use of AI assistants.
- **Writes** conversations, or folders of several sessions that belong to
  one task. The only required answer is whether the task is real or
  invented. A goal note is optional, private, and never sent to the model.
  Each session starts from nothing.
- **Cannot edit or regenerate.** A sent message stays sent and an answer
  stays the answer. The server refuses the attempt; it is not only missing
  from the page.
- **Submits once.** The whole conversation or folder is frozen, and what
  reviewers will see is written out at that moment: each session, and for
  a folder all sessions together in the order things happened.
- **Makes related versions** of submitted work: a fresh conversation on
  the same model, linked to the original, with what they intend to change
  said first.
- **Reviews** one record at a time, chosen for them, after reading the
  reference policy and answering four questions about how to apply it.
  One screen, one final answer, or a skip with a reason. Never their own
  work, never two things from the same family, never something that needs
  subject knowledge they have not said they have.
- **Compares** two related versions, as a separate task with its own form.
- **Enters** up to three pieces of work for a prize, with one click.

Gone: the author's own labels, the evidence-turn selector for authors, the
scanner tab, review batches, and written nominations.

### What an organizer now does

- **Policy**: publishes the reference policy and the rules reviewers can
  cite, in versions.
- **Submissions**: says who can review each submission (General, Routine
  in named subjects, Specialist) and marks it Ready, Held or Withdrawn.
  Shows how many reviews each view has and what they add up to.
- **Settings**: reviews per view, automatic release, how long a reviewer
  may hold an item, whether related versions are open.
- **Prize entries**: who entered what; closing entries.
- The participant page and the export follow the new shape.

### How it was built

A session is a row of the existing `conversation` table, so chat, budgets,
the message log and clipboard logging are unchanged underneath. New tables
sit beside it: `episode`, `episode_goal_revision`, `related_version`,
`review_view`, `review_assignment`, `review_response`, `pair_audit`,
`review_policy`. Migration 0007 adds them, turns each existing
conversation into a one-session episode, and asks everyone to answer the
new background questions. The old label, review and nomination tables are
left in place and no longer written to.

The rules about who may see what are held by the database as well as the
code: one active item per reviewer, one look at a family per reviewer, one
holder per place on a view, one audit per pair. Each is a unique index, so
two requests at the same instant cannot both win.

### Where this departs from the specification

Listed in full in the status document. In short: the reference policy is
a placeholder until one is published; new submissions wait for an
organizer unless automatic release is switched on; clipboard logging was
kept because it was asked for earlier; participants still choose a model;
review drafts are kept in the browser rather than on the server; a review
level applies to a whole submission rather than to one session of it.

### What the tests turned up

The first full run of the rewritten browser tests failed nine times. Seven
were the tests expecting the wrong thing. Two were real:

- **A folder could not be submitted.** Every session but the one on
  screen was counted as empty. The count was a subquery that referred to
  the outer conversation by a bare column name, which inside the subquery
  meant the message's own id, so it matched nothing. The same mistake was
  in nine other queries (the prize list, the names of related versions,
  several console counts). `lib/sql.ts` now has a helper, `outer`, that
  names the table, and all ten use it.
- **Yes or No to public release was stored as unanswered.** The radio
  group had no values, so the form posted "on".

Found by reading rather than by a test: the migration reset everyone's
background answers but not their agreement to the study information, so
existing accounts would never have been shown the two new agreements. It
resets both now.

### Tests

The browser tests were rewritten for the new flows: `authoring.spec.ts`,
`review.spec.ts` and `prizes.spec.ts` are new, the onboarding, dropdown,
front page and organizer tests were adapted, and the tests of labels,
scanners and nominations went with the features. The status document
lists which test covers each acceptance test in the specification.

---

## Round 22: the intake form, after trying it

The organizer ran the branch locally and found the background questions
confusing. Changes, all in `lib/intake.ts` and
`components/intake-fields.tsx`:

- **Role first, and required.** "Prefer not to say" is one of its choices.
- **Subject areas are always visible.** "No specialized background" and
  "Prefer not to say" are in the same list. Ticking one of them together
  with an area says so at once and is refused if sent.
- **What you could assess is asked where the areas are.** The separate
  "What you could review" section and its three-way question are gone:
  each ticked area gets a rating beneath the list, up to three. What is
  stored has the same shape as before, so routing is unchanged.
- **Fewer rows about kinds of work.** Writing, teaching and "other" are
  removed; five remain.
- **The biosafety and biosecurity experience questions are removed.**
- **One "Biosecurity" tag** in place of two.
- "Related technical fields" is now "Other technical fields".

The form version stored with each answer is now `A-1.2`. Answers given on
`A-1.1` are still read, and nobody is asked again. The status document
has a table of how this differs from the specification's form A.

Also in this round: the model list on the new conversation page ran off
the bottom of the screen with no way to scroll. It now fits the room it
has, opens upwards when there is more room above, and scrolls. And the
README said Node 20 where the libraries need 22.

---

## Round 23: more of the organizer's changes after trying it

- **Intake, form A-1.3.** Fewer ways not to answer. The role, each kind
  of work and the use of AI assistants no longer offer "prefer not to
  say", and AI use is required. The question about AI safety and
  biosecurity is required, with "Neither" as an answer. Primary area and
  narrower specialization are removed. One "prefer not to say" is left,
  in the list of subject areas.
- **Reviewing starts under a placeholder policy.** Migration 0008
  publishes it as version 1 where no policy exists. The organizer replaces
  it from Organize → Policy. Reviews record the version they were made
  under, so those made under the placeholder can be told apart.
- **Rules are optional.** A policy with no numbered rules does not ask
  reviewers which criterion supports their answer; the answer is stored
  as `not_asked`. The rules box in the console is folded away.
- **Nominations are back; the click-to-enter prizes are gone.** A prize
  entry is a written finding, as before v1.1: one entry per track on the
  Submit page, with a headline, the finding and an optional link to
  slides. The pages, the console tab and their tests are restored from
  before v1.1 unchanged. The `prize_entry_at` column stays in the
  database, unused.
- The Folder button has a plus, like Conversation.

Not changed, because they were questions rather than requests: authors
still do not label their own conversations (the specification removed
that), and "real or invented" is still asked when starting.

---

## Round 24: author labels are back, and required

The organizer wanted authors to describe their own work again, with new
questions and none of them optional.

- **Six questions in the side panel.** The role taken; the kind of task
  (tick all that apply, with "Other" asking what); the scenario; whether
  the author expects a reviewer to recommend specialist review; and how
  confident they are in that. The free-text goal is the one optional
  part, and is the same private goal note as before.
- **Required to submit.** Pressing Submit with something unanswered names
  each missing question and scrolls to the first. The server refuses too.
  Answers are saved as they are given and fixed at submission.
- **Author-only.** Not sent to the assistant, and not shown to a
  reviewer, whose view is built from the messages. They appear on the
  organizer's page for a participant and in the export.
- **A related version of a folder now starts as a folder.** It used to
  start as a single conversation that could be grown into one. The link
  is between the two pieces of work as wholes, not between sessions.

Stored in three new columns on `episode` (migration 0009). The questions
and choices are in `lib/author-labels.ts`, with their own version,
`L-1.0`, stored beside the answers.

---

## Round 25: one shared review definition in place of a policy of rules

The organizer revised the specification: reviewers no longer apply a
reference policy with rules, but one short, shared definition of what
they are deciding.

- **The instructions.** "Reviewing conversations for specialist
  attention", exactly as written in the revision, published by migration
  0011 as the next version. Shown before the first review, and beside
  every review as a fold-out with a one-line reminder above the form.
- **What is judged is the user's visible activity.** Whether the
  assistant answered, refused or blocked is not evidence either way. The
  whole conversation stays in view; nothing is hidden or redacted.
- **Five instruction questions** (R01 to R05) in place of four.
- **The review form.** The main question, confidence, rationale and
  uncertainty reasons use the revision's wording and choices. The
  question about which criterion supports the answer is gone, with all
  the rule machinery behind it. Evidence is the user's messages: only
  their numbers can be clicked, the server drops anything else, and "No
  specific affirmative evidence / overall pattern" is offered for No and
  Cannot determine but not for Yes. The sensitivity and aim scales are
  kept as they were.
- **Versions.** The form is `C-2.0` and the check `R-2.0`. Each review
  stores the instruction version it was made under; the export gives it
  as `review_instruction_version`. Anything made under the earlier
  rule-based form is `C-1.1` and should not be pooled with these.
- **The console.** "Policy" is now "Review instructions": one text box,
  no rules, and a note that the text is meant to stay fixed for the
  study.
- The author's question about what a reviewer will decide now says "the
  event's review instructions" where it said "the event's policy".

Not built: optional references to opposing user messages.

The table and columns keep "policy" in their names to avoid renaming
them the night before; `lib/policy.ts` says what they now mean.

---

## Round 26: start by typing; simpler review eligibility; the page stays in its frame

- **A conversation starts by typing.** The New conversation screen is a
  model picker and a message box, like any assistant. The conversation
  (or a folder's first session) is created when the first message is
  sent. The question about a real or invented task, the suggested
  starting points and the goal box are gone from that screen. Real or
  invented is asked in the side panel with the other author questions,
  and has to be answered to submit; the server refuses otherwise.
- **Anyone can review anything, by default.** A new submission is
  released at once as a General item, so any reviewer who has passed the
  instruction check can be given it. Migration 0012 turns this on and
  releases what was already waiting. An organizer can still restrict one
  submission to people with subject knowledge, or hold it, from
  Submissions, and can turn automatic release off in Settings. Still in
  force: never your own work, and never two things from the same piece
  of work and its related versions.
- **The page no longer scrolls past its frame.** Labels meant only for
  screen readers sat outside their scrolling panels and stretched the
  page. The panels now contain them, and the frame is clipped.

Asked about and not changed: the scanner panel (Llama Guard and the
judge) was hidden from participants in round 21 because a verdict shown
to an author steers what they write and how they label it. The scanners
still exist and answer organizers.

---

## Round 27: scanners back, the infohazard guide, five awards

- **The Scanners tab is back.** The side panel beside a conversation has
  two tabs again: Details (sessions, the author's questions, submitting)
  and Scanners (Llama Guard and the judge, run on the conversation on
  screen). The component is restored from before v1.1 unchanged, and the
  scanner endpoints answer participants again. Results are visible only
  to the person who ran them.
- **Infohazard guide.** A page of its own in the menu, under How it
  works, with the safety lead's text as written, and a link to it at the
  top of How it works. The text is one constant in
  `lib/infohazard-guide.ts`.
- **Five awards.** Most Qualified Transcripts and Most Qualified Reviews
  are counted and need no entry. Most Interesting AI Risk Finding, Best
  Comparative Investigation and Best Multi-Session Investigation are
  entered by written nomination on the Submit page, each with its own
  question and description. The earlier two tracks are retired; the
  database goes on accepting their values (migration 0013 adds the new
  ones). The briefing's prize table lists all five.

---

## Round 28: no routing, a shorter review form, and a history of background answers

- **No routing.** Organizers no longer set a review level or subjects, and
  reviewers are no longer matched on what they said they could assess.
  Every submission is available to every reviewer the moment it is
  submitted. The Submissions page has one control per submission: hold it
  back, withdraw it, or make it available again. The automatic-release
  setting, the bulk release and the "who can review" table are gone.
  Migration 0014 makes everything that was waiting or restricted
  available; held and withdrawn work stays as it was.
- **Skip comes first.** The review form opens with "Outside your
  expertise, or a record you recognize? Skip it." and a button, above the
  first question. The Skip button at the foot of the form is still there.
- **A shorter form (C-2.1).** The explanation is optional. The question
  about what makes the judgment uncertain is removed. The sensitivity and
  aim choices are shown in words, without "g0:" and the like; the codes
  are still what is stored.
- **A history of background answers.** Checking how a corrected profile
  shows up in the export found that only the latest answers were kept on
  the person, plus a copy inside each submission made at the time. There
  is now a row for every set of answers a person has given
  (`profile_revision`, exported as `participant_intake_revision`), so
  nothing is lost when someone corrects their background. The submission
  snapshot also carries the author's own labels.

What a changed profile looks like in the export, checked by a test: the
`participant_intake` line has the new answers and a later
`intake_updated_at`; there are two `participant_intake_revision` lines,
the first answers and the correction; and the submission made before the
change still carries the answers that stood when it was made.

---

## Round 29: one New page, any model per session, folder and session questions; the profile history taken back out

What the organizer asked for after trying round 28, and what was done.

- **One New page.** "+ New" in the list opens one screen. Choose
  Conversation or Folder, choose a model, type. No model is chosen in
  advance: sending without one says "Choose a model." The models are
  shown as a list on the page, grouped by maker, which also ends the
  cut-off dropdown on that screen. (`components/new-conversation.tsx`,
  `app/chat/page.tsx`)
- **Any model per session.** A folder is no longer tied to one model.
  "New session" opens the same New page, for that folder, and the model
  is chosen there. A related version of a folder starts on the source's
  first model and each later session chooses its own.
- **Folder questions and session questions.** Starting a folder asks two
  things about the folder as a whole: the role taken across its sessions
  and the kind of task, with an optional goal. Each session then has the
  full set of questions a single conversation has, and starts with the
  folder's answers filled in. Clicking the folder's name in the list
  opens a page where the folder's answers can be changed
  (`app/chat/folder/[episodeId]`). To submit a folder, the folder's two
  questions and every session's questions have to be answered; an
  unanswered session is named ("Session 2 still has unanswered
  questions").
- **Where the answers are stored.** Migration 0015 adds `author_labels`
  to each session (`conversation`) and copies existing answers onto the
  sessions they belong to. The export has them on each session record.
  A single conversation's answers are still on the episode, and are also
  copied onto its one session when it is submitted, so analysis can read
  sessions the same way throughout.
- **The profile history is taken back out.** Round 28 added a row per
  set of background answers. The organizer preferred the earlier
  behaviour: a profile edit replaces the stored answers. The table and
  the `participant_intake_revision` export records are gone (migration
  0015 drops the table). What is unchanged: each submission still
  carries a copy of the author's answers as they stood when it was
  submitted, so a later correction does not rewrite earlier work.
- **The model menu inside a conversation** no longer runs off the right
  edge of the window: near the edge it lines up with its button's right
  side.

Not built: **dragging a session into a folder.** Moving a session
between pieces of work touches submission, the reviewer's view, related
versions and the per-session answers, and there was no time to test all
of that before the event. "Add a session (makes this a folder)" in the
panel covers the common case: a conversation becomes the first session
of a folder.

Tests: the authoring tests for the New page, folder questions and
per-session models are new.

---

## Round 30: two kinds of review side by side, a clearer related conversation, a comparisons award

More from the organizer, trying the branch while round 29 was being
finished.

### The Review page

- **Two kinds of review, shown as equals.** "Transcript review" and
  "Comparison" are two columns of the same size with the same kind of
  button. Before, "Compare two versions" was an outlined button beside a
  filled one and read as the lesser choice.
- **The buttons always read the same**: "Get a review" and "Compare two
  versions". Before, the first became "Next item" after one review and
  both were replaced by "Continue where you left off" when something was
  paused. Now a button opens the half-finished one of its kind if there
  is one, with what had been filled in, and fetches a new one otherwise.
  A line under the button says when one is in progress.
- **One of each can be in progress.** A paused comparison used to leave
  no way to start a transcript review. The rule in the database changed
  from one item in progress per person to one per person per kind
  (migration 0016). Nobody is given two of the same kind at once, and
  the rule that a person sees a piece of work once, in one way, is
  unchanged.
- **Each kind has its own instructions, always in view under its
  button**, not folded away. The transcript instructions are the
  published review instructions, as before. The comparison instructions
  are new, written for this round, and live in one constant
  (`COMPARISON_INSTRUCTIONS` in `lib/review-form.ts`). They are also
  available, folded, beside the comparison form. **They are a draft for
  the organizer to read**: the research team has not seen them.
- **Counts are kept apart.** Each column says how many of its kind the
  reviewer has completed and skipped. In the console the overview says
  "Transcript reviews completed" beside "Comparisons completed", and
  what is in progress and what was skipped are split the same way; the
  participants table has "Transcript reviews" and "Comparisons" columns
  and sorts by either; a participant's page lists the two separately.
- **The stray line under the button** was the rule above the counts
  riding up against it. The counts now sit under each button and the
  rule is gone.
- **Coming back to the page shows it as it is now.** Pausing a record
  could show the Review page as it was before the record was opened.
  The page now asks for itself afresh when it appears.

### Related conversations

- **The form is reworded** as the organizer wrote it: "Create a related
  conversation", "What would you like to explore?" with four choices,
  each with a line of explanation (a different goal or purpose;
  different circumstances or context; a different way of asking;
  something else), and "What are you planning to change? (optional)".
  The paragraph of rules at the foot of the form is gone; the choices
  carry it.
- **Stored values.** `goal_purpose` and `context_change` are new.
  "A different way of asking" keeps the value `presentation_change` and
  "Something else" keeps `exploratory`, which is what those choices were
  under the earlier wording. `fact_change` is no longer offered and
  still reads correctly where it was already stored. A plan left blank
  is stored as empty text.
- **The comparison screen** leads with what the author set out to
  explore, in large type on a tinted band, with the choice's
  explanation and, if they wrote one, their plan in their own words.

### The comparison form (D-2.0)

Three questions, as the organizer wrote them, and an optional note:

| Question | Choices | Stored as |
| --- | --- | --- |
| Are these conversations about substantially the same scientific topic or task? | Yes / Partly / No / Cannot assess | `topic_task_match` |
| How similar is the scientific or technical scope of the requests? | Similar / Some meaningful differences / Very different / Cannot assess | `scope_similarity` |
| What is the main substantive difference between the conversations? | Goal or purpose / Circumstances or context / Wording or presentation only / Multiple substantial differences / No meaningful difference / Cannot assess | `main_difference` |

**A judgment call to check.** The request was to replace "What
comparison does this pair support?" with this table. The table's first
two rows cover the same ground as the old form's first two questions, so
the whole form was replaced, which also removes "Is the intended change
visible?" and the checklist of other differences. The third question
answers the first of those by comparison with what the author chose,
and "Multiple substantial differences" stands in for the second. If
either should come back, it is a few lines in `lib/review-form.ts` and
`components/pair-audit-workspace.tsx`; the columns are still in the
database (migration 0017 only stops requiring them and adds the two new
ones), and the export still carries them, empty for new answers.

### Awards and the Submit page

- **A sixth award: Most Qualified Comparisons**, quantitative, counted
  from completed comparisons, marked "Smaller prize pool" in the table.
  "Most Qualified Reviews" now says transcript reviews. The briefing no
  longer says how many awards there are in words that would go stale.
- **Submit page.** "Link to slides (optional)" is removed from the
  form. "Two prize tracks are decided by nomination." is removed from
  the top of the page. Links already saved are kept and still shown to
  organizers.

Tests: the comparison test now covers the instructions under each
button, the three questions, the author's band, a transcript review
started and finished while a comparison is paused, and the separate
counts. The related-conversation tests use the new wording and check
that the plan can be left blank.

---

## Round 31: four things a review of rounds 29 and 30 found

A review of the two rounds above turned up ten points. The organizer
asked for the first four to be fixed. The other six are listed at the
end, unchanged.

- **A paused review ran out of time while its reviewer worked on the
  other kind.** With one transcript review and one comparison allowed
  in progress together, only the one on screen was being kept alive.
  After the reservation time (45 minutes unless changed) the one set
  aside was released, and because a reviewer is shown a piece of work
  only once, it was gone for them for good, with what they had filled
  in. Now being at work on either keeps both. Both are still let go
  once the reviewer stops reviewing altogether. (`touchAssignment` in
  `lib/assignments.ts`)
- **Editing a nomination cleared its saved link to slides.** Round 30
  removed the field from the form, but the save still wrote the field,
  so an edit set it to nothing. The save no longer touches it. Round
  30's note that saved links are kept is true from this round.
  (`app/nominate/actions.ts`)
- **A folder session's goal had no history.** A conversation's goal
  has always been kept as revisions, each marked with whether work had
  begun, because a goal written afterwards is context and not a plan.
  A session's goal, new in round 29, was saved with its other answers
  and had none. Now each change to a session's goal is a revision
  marked with whether that session had begun, and the time its
  real-or-invented answer last changed is kept on the session. When a
  conversation becomes a folder, its goal history and that time move to
  its first session with the rest. (`saveSessionLabels` and
  `addSession` in `lib/episodes.ts`; migration 0018 adds
  `episode_goal_revision.conversation_id` and
  `conversation.provenance_changed_at`; both are in the export)
- **A draft conversation's session could carry old answers.** A
  conversation that stands alone keeps its answers on its episode, with
  a copy on its one session so every session reads the same way. The
  copy was made only at submission, so in an export that includes
  drafts the session could be empty or behind. The copy is now brought
  up to date with every change, and migration 0018 brings existing
  drafts level. (`mirrorOntoSession` in `lib/episodes.ts`)

Saving a session's answers is also now one step that holds the folder
while it writes, so it cannot cross with the folder being submitted
(the fifth point of the review, fixed in passing because the same
function was being rewritten).

Not changed, from the same review:

- The fix for a page shown as it was before is on the Review page only.
  The folder's page may show a session's "Questions to answer" for a
  moment after they were answered, until it is reloaded.
- A related version drafted under the wording before round 30 with
  "Change a substantive fact..." has to pick one of the new choices
  before its plan can be reworded. Only drafts made before round 30.
- A session added to a related version's folder is listed without the
  related-version mark until the page is reloaded.
- Some small things are written twice: the list of real-or-invented
  values, a pattern for checking an id, and the role and kind-of-task
  questions in the side panel.
- `components/episode-panel.tsx` was reformatted as a whole in round
  29, which makes that file's changes in that round harder to read.

Tests: each of the four has one. A comparison set aside three hours
ago is still there after its reviewer reloads the transcript they are
on; a nomination edited after a link was saved still has the link; a
session's goal is a revision marked as written after the session began,
changing another answer does not add one, and a conversation's goal
history moves with it into a folder; a draft conversation's session has
its author's latest answers.

---

## Round 32: submit one session of a folder, related versions between single conversations, a plainer form and briefing

From the organizer, after reading through the branch.

### Submitting

- **A session of a folder can be submitted by itself.** In a folder the
  panel has two buttons. "Submit conversation" submits the session on
  screen: it is closed, fixed, and can be reviewed at once, and the
  folder stays open. "Submit folder" submits every session with
  something in it, adds the folder read as a whole for reviewers, and
  closes the folder. Before, a folder could only be submitted whole, so
  one finished session waited on the rest.
- **What is checked.** Submitting one session needs that session's
  questions answered. Submitting the folder needs the folder's two
  questions and the questions of every session not yet submitted.
- **The folder's page has "Submit folder"** too, with what is still in
  the way if it cannot go yet.
- **The folder in the list** is now a bordered row with a tag,
  "Submitted" or "Not submitted", and an arrow, so that it reads as
  something to click and as something that is itself submitted. A
  session sent in ahead of its folder says "Submitted by itself".
- **For reviewers and organizers.** A session submitted by itself is
  handed out like any other record. The Submissions page lists a folder
  as soon as one of its sessions is submitted, marked as still open, so
  it can be held back or withdrawn. Work an organizer has held stays
  held when more of it is submitted. The export's submitted-only file
  includes such a folder with its submitted sessions.

One function does both kinds of submission (`submitEpisode` in
`lib/episodes.ts`, with the session to submit by itself as an optional
argument), so the two cannot drift apart.

### Related versions

**Before this round the link was between two pieces of work**, and a
related version of a folder was itself a folder. The organizer's model
is the other one, and is what is built now:

- A related version is made from **one submitted conversation**: one
  that stands alone, or one session of a folder (which, with the change
  above, can be submitted before its folder).
- It is always **a single new conversation**.
- **The link is between the two conversations.** If the new one is
  later given more sessions and so becomes a folder, it is still that
  one conversation that is related. The folder is not, and the sessions
  that join it are not.
- **A comparison shows the two conversations**, not the folders either
  sits in. A pair can be compared once both conversations are
  submitted.

In the database `related_version` gains `source_conversation_id` and
`target_conversation_id` (migration 0019, which fills them in for
existing links from each side's first session). The episode columns are
kept: they say which conversation or folder each side belongs to, and
the rule that a reviewer sees a piece of work once still goes by them,
so someone who reviews or compares one side is not given the other, or
the rest of a folder it is in. The address of the form is now
`/chat/related/<conversation>`.

### The author's questions (form L-1.1)

- **"Real or invented?" is no longer asked**, anywhere. Answers given
  while it was asked are kept and still shown to organizers; nothing
  requires one.
- **The scenario question comes first**: "Which best describes the
  scenario you're constructing?"
- **No headings or descriptions between the questions.** "Conversation
  setup" and "Your assessment", with their notes, are gone. The order
  is scenario, role, kind of task, goal (optional), what a reviewer is
  expected to decide, confidence.
- "What holds across its sessions." is removed from the folder's
  description on the New page and on the folder's page.

### Wording

- Review page buttons: **"Review a transcript"** and **"Compare two
  related transcripts"**.
- **"Best Comparative Investigation" is now "Best Matched Set
  Investigation"** wherever it is shown. Its stored value and its
  address stay `comparative`, so existing entries are untouched.
- "Smaller prize pool" is no longer on the prizes table.

### How it works

Rewritten to be skimmed. Each section is a few short parts with a
heading and a list. Writing has parts for starting, folders, the panel,
submitting, related versions and the ground rules. Reviewing has a part
for each kind of review, numbered and named as on its button, and one
for skipping and pausing. Prizes has the table, then a part each for
the counted awards and the ones entered by write-up. The content was
brought in line with everything above.

### A question answered, not a change

"Why are we not using more updated models?" The models on offer are
kept in the database, so that an organizer can change them during the
event. The code carries a list (chosen 11 November) that is used only
where the database has none, and offered in Organize → Settings when it
differs from the one in use. A database set up before that date still
shows the older list until someone takes the new one there. The
deployed site had that done; a local database has not unless it was
done there too.

Tests: one session submitted by itself, closed to further messages and
reviewed while its folder is open; the folder then submitted with all
its sessions; a related version made from a session of a folder, and
that conversation later put into a folder; the form's order and what is
no longer in it; the new names.

---

## Round 33: a list of your reviews, reopening and changing them, straight on to the next record

From the organizer, using the Review pages as a reviewer.

### What was asked and what was done

- **"After I submitted a review a whole new page came up confirming it
  and sent me back to the landing page."** Submitting now goes
  **straight to the next record** of the same kind. Only when there is
  no next record does it go back to Review, which then says what was
  recorded and why nothing followed. Skipping does the same.

  The page seen was "You have finished this one", a dead end meant for
  someone returning to an old address. It could replace the form after
  a submit, because the page behind the form can be asked for again
  once the record is finished. That page no longer exists for finished
  records: they open as below.

- **A list of your own reviews, beside every Review page**, as the
  interface had before v1.1. "In progress" has the transcript review
  and the comparison in hand, if any. "Completed" has everything
  finished, newest first. Records are numbered ("Transcript 3"), never
  named: a reviewer is not shown a title or anything about an author.

- **A finished review or comparison opens again with its answers, and
  they can be changed.** The button reads "Update review" or "Update
  comparison". **Every earlier version is kept** (`review_revision`,
  migration 0020), with the first answer as version 1, so the first,
  independent judgment is never lost. The current answers carry
  `revised_at` and `revision_count`, and the list marks a changed item.
  Saving with nothing different is not a change. All of this is in the
  export.

  This replaces "a review is final", which is what the specification
  asks for. The reason for that rule is that a judgment changed after
  seeing other records, or after talking to people, is no longer
  independent. Keeping the first version answers that: analysis can
  take first answers only, latest only, or study what changed.

- **The comparison screen is laid out like the transcript review**:
  the "Skip this one" box first, then a line on what is being judged,
  then the instructions folded away, then the questions.

- **"Why am I given nothing to review when there are unreviewed
  transcripts?"** The usual reasons, in order: the work is your own;
  you have already been shown it (reviewed, compared, skipped, or in
  progress), and a piece of work is shown to a person once, in one way;
  it already has all its reviews; an organizer has held it back. In the
  example given, the organizer had compared that pair, so neither side
  can be reviewed by them: comparing shows what the author set out to
  explore, which a reviewer of either side must not know.

  Two changes came out of it. **"Nothing right now" now says why, in
  numbers**: how many records there are and how many fall under each
  reason (`whyNothing` in `lib/assignments.ts`). And **a record whose
  hold only ran out, with nothing recorded, can come back to the same
  person**; before, a record left open past the reservation time was
  closed to that person for good, which uses up a small pool quickly
  when testing.

- **"27 sessions in 24 pieces of work?"** A folder is one piece of
  work and holds several sessions. The overview now says
  "Conversations and folders submitted", how many of each, and that a
  folder counts once.

### Where

`components/review-sidebar.tsx` and `app/review/layout.tsx` (the list);
`components/review-workspace.tsx` and `components/pair-audit-workspace.tsx`
(reopening, the common layout, going on to the next record);
`submitReview` and `submitAudit` in `lib/assignments.ts` (a change is
the same call as a first answer, and keeps what it replaces).

Tests: a finished review is in the list by number, opens with its
answers, is changed with the earlier version kept, and saving again
changes nothing; the same for a comparison; submitting goes to the next
record with no page between; a timed-out record is given again; the
reasons for "nothing" are stated; the comparison form opens with the
way to skip and folded instructions.

---

## Round 34: "related conversation" throughout, and no version numbers shown to participants

- **The buttons read "Create related conversation"** and "Submit source
  and create related conversation", matching the form's title. The
  same word is now used wherever a participant reads it: the panel
  ("A related conversation", "Related conversations made from this"),
  the messages on a closed conversation, the briefing, and the two
  columns of a comparison ("Original conversation" and "Related
  conversation"). The organizer's setting reads "Related conversations
  are open". Left as they were: the award descriptions and one of the
  five instruction-check questions, which are the organizer's own text
  and say "related versions".
- **No version numbers on instructions or study information for
  participants.** "Review instructions (version 2)" is "Review
  instructions", on the Review page, beside the review form and on the
  instruction check. The study information at sign-up no longer says
  "Version N", and the profile page says "Agreed" with the date. The
  version is still recorded with every review and every agreement, and
  still shown in the organizer console and the export.

---

## Round 35: a tester mark for test data, and why a record cannot be reviewed

### Test data

The organizer needs to tell what was made while testing from what the
event produces, and proposed making every existing account an
organizer and leaving organizers' data out later. That would have
given every tester the console (the export, pausing chat, settings),
asked each of them for a longer password, and left their test
transcripts in the queue for real participants to review. Offered a
choice, the organizer took a mark that carries no powers.

- **A tester mark on accounts** (`tester_account`, migration 0021). It
  is a table of its own, not a column on the account, so that signing
  in and every page do not depend on it.
- **Organize → Participants** has "Mark everyone so far as a tester":
  one click, with a confirmation, for the moment before the event
  starts. Accounts made after that are participants. Each account's
  Manage row has "Mark as tester" and "Remove tester mark". The list
  can be narrowed to everyone, participants or testers, and a tester is
  tagged in it.
- **Two pools that never mix.** A tester's work is given only to
  testers to review; a participant's only to participants. So test
  transcripts never reach the people at the event, and an organizer
  trying things during the event does not take a review place on real
  work.
- **Counts.** Every number on the overview leaves testers and their
  work out, and says how many accounts that is.
- **Labels.** The Submissions page tags tester work. The export has
  `is_tester` on each person, `author_is_tester` on each piece of work
  and `reviewer_is_tester` on each assignment.
- Marking and unmarking are recorded in the console's log.

A tester who wants to take part in the event for real should use a new
account, or have the mark removed before they start: the mark is on the
account, so everything the account does carries it.

### Why a record cannot be reviewed

The organizer asked why they were given nothing to review when the
console showed submitted work. There is no access to the production
database from where this is written, so two things were added to answer
it in place:

- **Submissions made before specification v1.1 have no copy for
  reviewers.** That copy is made at the moment of submitting, starting
  with v1.1; migration 0007 carried old conversations over as submitted
  without making one. They counted as submitted and showed as
  "Available", and could never be handed out. The Submissions page now
  marks them "Cannot be reviewed" and says why. They are test data, so
  nothing was done to make copies for them.
- **`scripts/why-nothing-to-review.sql`** is a query for the Neon SQL
  editor. With a sign-in email put in, it lists every submitted piece
  of work and the reason it is or is not offered to that person: no
  reviewer copy, their own work, already shown to them (and how), held
  back, already fully reviewed, or available.

### The Review pages failing on the live site

After round 34 was merged, `/review` showed a server error. The new
code reads columns that migration 0020 adds, so the likeliest cause is
that 0020 had not reached the production database when the new version
went live. `docs/DEPLOY.md` says to run `npm run prod:migrate` from an
up-to-date checkout before `main` moves; a checkout that has not been
pulled has no new migration to apply.

### A reply shown as a blank bubble

A reviewer saw an assistant turn with nothing in it and no explanation.
A reply with no text has always been shown with a note ("No reply text
was returned", or that the request failed). A blank bubble means the
stored reply was not empty but held nothing visible: a zero-width
space or a similar character. Such a reply is now treated as empty, on
the review screen and in the author's own chat (`lib/visible-text.ts`).
What that particular reply holds cannot be seen from here; the query at
the foot of `scripts/why-nothing-to-review.sql` shows it.

Tests: an account marked from its row; its work out of the overview
count; not given to a participant, given to a tester; tagged in
Submissions; labelled in the export; everyone marked in one go, and an
account made afterwards not marked.

---

## Round 36: the terms and conditions, one agreement, and starting a session in a folder

### Terms and conditions

- **The organizer's Participant Terms and Conditions are the default**
  (`lib/default-terms.ts`), in place of the placeholder. They are what a
  new database starts with, and Organize → Terms has "Load the default
  terms", which puts them in the box to be checked and published.
  Publishing stays a deliberate act by an organizer: it asks every
  account to agree again.
- **Nothing was published by this change.** The live site keeps the
  terms it has until an organizer publishes.
- **The text supplied was cut off** part-way through Appendix A, in the
  conflict of interest list, before the reporting procedure that the
  terms refer to. The default carries a note in square brackets at that
  point, beginning `[ORGANIZER:`, and **text containing that note
  cannot be published**: the button stays off and the server refuses.
  Paste the rest, remove the note, publish.
- **Three more things in the supplied text for the organizer to
  check**, left exactly as supplied:
  - section 6 ends "described in [Event Privacy Notice or ASTRAL
    Privacy Policy]", a placeholder;
  - Appendix A opens "The Cambridge Boston Alignment Initiative
    (ASTRAL)" and gives an address at "ASTRAL.ai", which look like one
    organization's name replaced by another's throughout;
  - Appendix A names a member of staff and their email address.
- **One agreement at sign-up**, worded as the terms word it: "I have
  read and agree to the ASTRAL Hackathon Participant Terms and
  Conditions, including the ASTRAL Code of Conduct and Anti-Harassment
  Policy." Before, there were two boxes, the second saying
  contributions would be used "under restricted access", which the new
  terms do not say. Agreeing records both the participation and the
  research-use agreement, since section 12 makes them one. The optional
  question about public release is unchanged. The in-text checkbox line
  under "Acceptance" was left out of the document, because the form
  supplies the box.
- "Study information" is now "Terms and Conditions" wherever a
  participant reads it.

### Starting a session in a folder

- **The folder's page opens with a "New session" button**, beside its
  title, above everything else. It used to sit beside the list of
  sessions further down.
- **The folder's row in the list has a "+"** at its right-hand end,
  which goes straight to a new session in that folder. It is there
  while the folder is open and gone once the folder is submitted.

Tests: the default terms load into the box and cannot be published
with the note in them; sign-up has one agreement, refused without it;
the "+" in the list starts a session in the folder and is gone after
the folder is submitted; "New session" is above the folder's questions.

---

## Round 37: the three qualitative awards renamed, with a general one

The awards entered by write-up are now, in this order:

| Award | Before | Changed |
| --- | --- | --- |
| Best Investigation: Matched Set | Best Matched Set Investigation | name only |
| Best Investigation: Multi-Session | Best Multi-Session Investigation | name only |
| Best Investigation: General | Most Interesting AI Risk Finding | name and description |

**General is a catch-all.** Its predecessor asked for "an important
limitation, ambiguity, or potential risk of AI assistance in dual-use or
fictional adversarial scenarios", which steers people toward adversarial
work. The new wording asks for any well-evidenced investigation that is
neither a matched set nor a multi-session study, says that ordinary,
benign use is as welcome as dual-use or adversarial work, and that an
entry does not have to be about a risk or a failure. Its question is
"What did you find?".

The names are used everywhere they appear: the prizes table and the
write-up in How it works, the Submit page and each entry form, and the
organizer's Nominations page.

**What is stored did not change.** Each award has a stored value that
stays put when it is renamed (`comparative`, `multi_session`,
`ai_risk_finding`), so entries already made are still under their
award, and no migration is needed. What a participant sees in the
address follows the new names: `/nominate/matched_set`,
`/nominate/multi_session`, `/nominate/general`. The old addresses lead
to the new ones.

Tests: the three names, in order, on the Submit page and in the prizes
table; nothing about AI risk on either; the general award's description
and address; the old address leading to the new one.

---

## Round 38: three tests that failed in CI, and why they passed here

Rounds 36 and 37 were pushed with every test passing on the machine
they were written on, and failed in CI, which stopped the deployment:
the live site waits for that check.

**Nothing was wrong with the application.** Three tests failed, all for
one reason. Round 36 made the organizer's terms the text a new database
starts with. CI makes a new database for every run; the database the
tests had been run against here was older and still held the earlier
placeholder. The real terms have headings of their own, and three tests
looked for things in a way that could not tell those apart:

- one counted the headings of the background questions across the whole
  page, and found three more, from the terms;
- one looked for the heading "Participant Terms and Conditions" and
  found two, the form's and the document's own title;
- one pressed "Load the default terms", which is switched off when the
  box already holds them.

Each now looks only where it means to. The suite was then run on a
database made from nothing, which is what CI does, and that is how it
should be run before anything is pushed: a pass on a database with
history in it is not the same test. `docs/TESTING.md` says how.

---

## Starting over

To wipe all accounts and their data while keeping settings, terms and judge
configurations, run this in a SQL console:

```sql
DELETE FROM "user";
```

Everything belonging to those accounts is removed with them.
