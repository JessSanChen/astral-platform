# Testing and CI

What checks this project has, how to run them, and what happens
automatically. For the history of how each came about, see
[BUILDLOG.md](BUILDLOG.md), rounds 11 to 20.

## What there is

| Check | What it answers | Runs |
|---|---|---|
| Lint and typecheck | Does the code hang together? | On every push, and `npm run lint` / `npx tsc --noEmit` |
| Browser tests (`e2e/`) | Can a person actually do the things the app is for? | On every push, and `npm run test:e2e` |
| Load test | Does it hold with seventy people at once? | By hand: `npm run load-test -- 70 3` |
| Doctor | Is this particular deployment wired up correctly? | By hand: `npm run doctor`, `npm run prod:doctor` |

The first two are about the code and run by themselves. The last two are
about a running system and are run when there is a reason to.

---

## Browser tests

Fifty-nine tests in `e2e/`, written with Playwright. Each one opens a real
browser and uses the app the way a person would: clicking, typing, reading
what is on the screen. They run against a production build, because that is
what participants get.

Model replies come from the stand-in provider in
`scripts/mock-openrouter.mjs`, so a run needs no API key, spends nothing, and
does not fail because a model is having a bad day.

### What they cover

| File | What it walks through |
|---|---|
| `home.spec.ts` | The front page introduces the day, lists the models on offer and carries no briefing. The briefing is shown once signed in, with its sections and the two nominated tracks, nothing about scanners or a collaborative prize, and a Submit link in the menu to the nominations page. Every page says which commit it was built from. |
| `signup-onboarding.spec.ts` | A wrong event code is refused. The account endpoint refuses a sign-up without the code even when the form is skipped. A weak password is refused with the reason on screen, and the server applies the same rules as the form. A mistyped email is questioned but not refused. Sign up, agree, answer the background questions in their order (role, subject background, kinds of work, AI assistants), land in the chat, with the answers stored under the specification's identifiers and nothing left behind by questions no longer asked. Both agreements are needed and public release is a separate optional answer. A missing role and missing work rows are named and nothing else is lost. "No specialized background" ticked with an area is said at once and refused; nothing ticked at all is refused; an area left unrated is accepted. Ticking "Other" asks which area, and offers nothing to rate. Background answers can be corrected later. |
| `select.spec.ts` | The dropdown works from the keyboard alone, announces itself properly to a screen reader, closes on a click elsewhere, carries its value into the form, and opens upwards when there is no room below. |
| `authoring.spec.ts` | A conversation has to say whether its task is real or invented to start; submitting with the author's questions unanswered is refused and names each one, and "Other" has to say what; the answers are stored and shown back fixed; a private goal note is never sent to the model and is absent from what reviewers are shown; submitting freezes it and writes the reviewer's view at that moment; a new submission waits as Pending. The server refuses a regenerated reply, a message after submitting, and a second submission. A folder's second session starts from nothing; an empty session is left out; the folder is submitted as each session plus all of them together in order, under neutral names. A goal written after the work began is recorded as that. Adding a session turns a conversation into a folder. A related version of a folder starts as a folder, with nothing carried over. A related version cannot be made from a draft, has to say what will change, starts empty on the same model, and is linked into the same family. A conversation carries on after an empty reply, which stays in the record. A paste into the message box and a copy out of a reply are recorded. |
| `review.spec.ts` | The shared review definition, word for word where it matters, and five questions come first; a wrong answer says why; with nothing released, the page says there is nothing. A reviewer is given one record with none of the author's notes or name; the author is never given their own; nobody else can open the assignment; an empty form is refused by name; there is no menu of rules; only the user's messages can be chosen as evidence, the assistant's reply stays in view; a Yes has to point at a user message; the stored answer carries the form version and the instruction version; afterwards the address only says it is done and the same family is not offered again. A reload or a pause keeps the same item and what was filled in. A skip records a reason and no verdict, does not come back to the same person, and frees its place. A specialist record goes only to someone who rated themselves F3 in the subject, a routine one to F2 or F3, neither to a general reviewer. A record with no place left is not handed out, and one put on hold while being read does not accept the review. Two related versions are compared on their own form by someone who then reviews neither. |
| `nomination.spec.ts` | Two tracks, and no trace of the third. An entry with a link to slides, a link that is not one refused without losing what was typed. An empty entry refused. |
| `security.spec.ts` | A password anyone could guess is refused at sign-in even when it is right, and a temporary one from the command line is the way back. One built on the owner's own name has to be replaced before anything works, reading included, and the login system's own change-password address is shut. An organizer needs a longer password than a participant, gets nothing from the login system's administration API, and loses the console the moment the role is removed. Eight wrong passwords lock an account, even against the right one; forty sent at once do not get past that; a paused account using the right password is not counted. An organizer sets a temporary password, which signs the owner out and has to be replaced. The change-password form allows the same eight attempts. Changing a password signs out another browser on the same account. An organizer signs everyone out. |
| `organizer.spec.ts` | Participants cannot reach the console or the export. Counts match what was submitted and drafted. Promoting a participant. The controls beside a participant fit. The export carries episodes marked submitted or draft, sessions with their messages, the frozen review view, background answers and the policy, and leaves drafts out when asked. A participant's page shows every piece of work in full with provenance and the private goal note, filtered either way. A submission waits as Pending; a level that needs a subject is refused without one; releasing it as General lets a reviewer have it; holding it takes it back from the reviewer who had it open. Everything waiting is released at once. Publishing new review instructions (there are no rules to enter) warns that they are meant to stay fixed, makes reviewers answer the instruction questions again, and a review made afterwards records the new version. Review settings change from the console, and automatic release works. A closing time set from a laptop on Tokyo time is 3pm in Boston for everyone. A closing time already in the past is refused. An unreadable allowance is refused rather than stored as zero. |
| `running-the-day.spec.ts` | The organizer's controls, each checked from the participant's side. Pausing chat turns messages away and resuming lets them through. Closing nominations by hand closes the form in front of a participant who has it open, shows their entry as text, tells them what they had not saved, and reopening frees it again. Publishing new study information sends a participant to agree to it, once, without asking for their background again. Switching to the model list that came with a new version of the app, which says what it would add and remove first. |

Several of these are the scenarios from the code review in round 10, kept so
that those fixes cannot quietly come undone.

### What they do not cover

The organizer's page for one participant, pausing a single account, raising
one person's allowance, setting a temporary password, and anything at phone
width. These work as far as I have checked by hand; nothing checks them
automatically.

They also say nothing about real models. A model that has been retired, or
a provider that filters a scanner's output, is found by `npm run doctor`,
not by these.

One test is slow on purpose. The app remembers event settings for ten
seconds rather than reading them on every request. A change made from the
console clears that at once, but the terms test tidies up by deleting a row
behind the app's back, and waits the ten seconds out so the next test does
not meet a version of the terms that no longer exists.

### Running them yourself

Once per machine, to download the browser:

```bash
npx playwright install chromium
```

Once per database, to create the tables and seed data, and again whenever
the model list in `lib/models.ts` changes:

```bash
npm run test:e2e:prepare
```

This also marks the database as one the tests may use. They refuse to run
against a database without that mark.

Then, whenever you like:

```bash
npm run test:e2e
```

To watch the browser do it, with a timeline you can step through:

```bash
npm run test:e2e -- --ui
```

To run one file, or the tests whose names match a phrase:

```bash
npm run test:e2e -- e2e/review.spec.ts
```

```bash
npm run test:e2e -- -g "closing time"
```

### Which database they use

The `DATABASE_URL` in `.env.test.local` if that file exists, otherwise the
one in `.env.local`. The run prints which before it starts.

The tests create accounts at `@e2e.test`, change event settings while they
run (the nomination deadline, the default allowance), and put everything
back afterwards. Pointing them at your development database works, but a
database of their own is tidier: make a second free Neon project and put its
pooled connection string in `.env.test.local`:

```
DATABASE_URL=postgresql://...-pooler.../neondb?sslmode=require
```

### Why they cannot touch production

Before the first test, the suite reopens nominations, unpauses chat and
deletes its own accounts. Against the real event that would be a bad
minute, so two things stand in the way (`scripts/e2e-guard.mjs`):

- If the database is the one in `.env.production.local`, the run stops.
  That file is read only to compare addresses; nothing in it is used.
- If the database has not been prepared with `npm run test:e2e:prepare`,
  the run stops. Preparing is itself refused for production, so production
  can never carry the mark.

A `DATABASE_URL` left in your shell beats both files, which is exactly the
accident this is for.

The tests also always build the app afresh and refuse to start if their
ports (3100 and 4100) are already taken, so they cannot pass against a
server left over from an earlier run. If they say a port is in use, stop
whatever is on it.

### When one fails

Locally, the output names the step that failed and what was on screen
instead. Add `-- --ui` or `-- --headed` to watch it happen.

In CI, the run keeps a report for a week: open the failed run on GitHub,
scroll to **Artifacts**, download `playwright-report`, and open
`index.html`. Each failed test has a screenshot and a trace, which is a
recording you can step through action by action.

### Adding one

`e2e/helpers.ts` has the building blocks, so a test reads as a description
of what someone does:

```ts
test("a participant can do the new thing", async ({ browser }) => {
  const { page, context } = await newParticipant(browser, "Nia New");
  await startConversation(page);
  await say(page, "A question.");
  await choose(page, "What kind of transcript is this?", "Benign", labelsPanel(page));
  await expect(page.getByText("whatever should now be true")).toBeVisible();
  await context.close();
});
```

Find things the way a person would, by their label or their visible text,
not by CSS classes. A test written that way keeps working when the page is
restyled, and fails when a label disappears, which is the failure you want.

`e2e/db.ts` reaches into the database for the few things a test cannot do
through the interface: becoming the first organizer, and checking what was
actually stored. Use it sparingly.

---

## CI

`.github/workflows/ci.yml` runs on every push to any branch. One job, about
three minutes:

1. Install dependencies.
2. Lint.
3. Typecheck.
4. Start an empty Postgres, create the tables, seed it.
5. Build the app for production and run all the browser tests against it.

It needs no secrets. The database exists only for the length of the run.

**Where to see it:** the **Actions** tab of the repository, or the tick or
cross next to each commit. A cross links to the step that failed.

### What stops a failing change reaching the site

By itself, CI only reports. GitHub's own way of making it block is branch
protection, which on a private repository needs a paid plan. The same
effect comes from Vercel instead.

### The lock: Vercel's Deployment Checks

Switched on in round 14, and tested. Vercel builds each new version of
`main` as usual but does not point the live address at it until the GitHub
check **Lint, types and browser tests** has passed on that commit. A commit
that fails is built and then left where it is, and the site goes on serving
the last one that passed.

The setting is in Vercel under **Settings → Deployment Checks**. If the job
in `.github/workflows/ci.yml` is ever renamed, the check there has to be
renamed to match, or deployments will wait for a check that never arrives.

How it was tested, since "it is switched on" and "it works" are different
claims:

| Commit | What was pushed to `main` | CI | Live site |
|---|---|---|---|
| `7a03eb9` | A change that had already passed CI on the branch | passed | Went live 41 seconds after the push |
| `fe5f674` | One deliberately failing test, no application code | failed after 3 minutes | Still on `7a03eb9` seven minutes later |
| the commit after | The failing test removed | passed | Went live |

### How changes reach `main`

Nothing goes to `main` until CI has passed on that exact commit:

1. Work is pushed to the working branch.
2. CI runs on it.
3. Once that run is green, `main` is moved forward to the same commit.

With the lock in place this is belt and braces, but it is worth keeping. A
commit that has already passed goes live in under a minute; one that has
not sits waiting for three, and a failure on `main` leaves `main` itself
broken until it is fixed, even though the site is protected.

### Which commit is live

Every page carries the commit it was built from, in a
`<meta name="astral-build">` tag, and **Organize → Settings** shows it in
words. Compare it with the latest commit on GitHub. If the site is behind,
look at that commit's check: a red cross there is why.

### If CI is red and the site needs fixing now

Vercel's dashboard lets you promote a deployment by hand: open the project,
find the deployment under **Deployments**, and choose **Promote to
Production**. That is the way round the lock in an emergency on the day.
Use it rather than switching the check off, so the lock is still there the
next morning.

The same list is how to go back: promoting an older deployment puts the
site back on it within seconds.
