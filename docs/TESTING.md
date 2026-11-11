# Testing and CI

What checks this project has, how to run them, and what happens
automatically. For the history of how each came about, see
[BUILDLOG.md](BUILDLOG.md), rounds 11 and 12.

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

Thirty-one tests in `e2e/`, written with Playwright. Each one opens a real
browser and uses the app the way a person would: clicking, typing, reading
what is on the screen. They run against a production build, because that is
what participants get.

Model replies come from the stand-in provider in
`scripts/mock-openrouter.mjs`, so a run needs no API key, spends nothing, and
does not fail because a model is having a bad day.

### What they cover

| File | What it walks through |
|---|---|
| `home.spec.ts` | The front page names the five prize tracks with their deadlines and lists the models on offer. Every page says which commit it was built from. The in-app copy of the briefing asks a signed-out visitor to sign in. |
| `signup-onboarding.spec.ts` | A wrong event code is refused. The account endpoint refuses a sign-up without the code even when the form is skipped. A weak password is refused with the reason on screen, and the server applies the same rules as the form. A mistyped email is questioned but not refused. Sign up, answer the profile questions, land in the chat. A question left unanswered is named and nothing else is lost. A profile can be corrected later. |
| `select.spec.ts` | The dropdown works from the keyboard alone, announces itself properly to a screen reader, closes on a click elsewhere, posts its value with the form, and opens upwards when there is no room below. |
| `transcript.spec.ts` | Chat, the conversation naming itself, renaming it, a submit refused for a missing answer, version 1, version 2, all of it surviving a reload. Label answers surviving the scanners tab and a visit to another conversation. Regenerating a reply replaces it rather than adding one. A scanner run giving a result. |
| `review.spec.ts` | Two people in two browsers. The reviewer sees the submitted version and nothing the author wrote about it. An incomplete review is refused without losing answers. The author resubmits while the review is open: the reviewer is told, shown the new version, keeps their answers, and the review is recorded against the right version and locks the transcript. |
| `nomination.spec.ts` | A collaborative entry with one collaborator picked from the list and one typed in. An empty entry refused. |
| `organizer.spec.ts` | Participants cannot reach the console or the export. Counts match what was submitted. Promoting a participant. The export carries the labels as submitted. A closing time set from a laptop on Tokyo time is 3pm in Boston for everyone. An unreadable allowance is refused rather than stored as zero. |
| `running-the-day.spec.ts` | The organizer's controls, each checked from the participant's side. Pausing chat turns messages away and resuming lets them through. Closing nominations by hand freezes entries and reopening frees them. Publishing new terms sends a participant to accept them, once, without asking for their profile again. |

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

Three of the tests are slow on purpose. The app remembers event settings
for ten seconds rather than reading them on every request, so a test that
changes one and then needs everyone to see it waits that long.

### Running them yourself

Once per machine, to download the browser:

```bash
npx playwright install chromium
```

Once per database, to create the tables and seed data:

```bash
npm run test:e2e:prepare
```

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

They never read `.env.production.local`. Do not point them at production.

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
