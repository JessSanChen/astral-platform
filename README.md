# Astral

**A platform for running a one-day event where people chat with AI models, label what they did, and review each other's work, producing a dataset for AI biosecurity research.**

Astral was built for the ASTRAL Boston Biosecurity Hackathon. Tools that screen AI conversations for biological misuse need realistic conversations and careful human judgments of them, and very few exist in the open. Astral collects both. Participants talk to frontier and open-weight models through a familiar chat interface, describe what they were doing, and submit. Other participants then review those transcripts anonymously. Organizers watch it all live from a console and export the finished dataset.

![A conversation in Astral, with the questions about it in the side panel](docs/screenshots/conversation.png)

---

## Contents

- [What it does](#what-it-does)
- [A tour](#a-tour)
- [Run it locally in five minutes](#run-it-locally-in-five-minutes)
- [Becoming an organizer](#becoming-an-organizer)
- [Deploying for a real event](#deploying-for-a-real-event)
- [Useful scripts](#useful-scripts)
- [Tests](#tests)
- [How it's built](#how-its-built)
- [Further reading](#further-reading)

---

## What it does

**For participants**

- **Chat with frontier and open-weight models** from Anthropic, OpenAI, Meta, Alibaba and Moonshot, chosen per conversation, with streaming replies, Markdown and tables.
- **Group related work in folders.** A folder holds several sessions on one task, each a fresh chat that can use a different model.
- **Describe and submit.** A few short questions in the side panel (role, kind of task, scenario, expected review outcome) travel with each submission. Submitting is final.
- **Try a related conversation.** From a submitted one, start a variation that changes the goal, context or wording.
- **Run safety scanners** (Llama Guard and an LLM judge) on their own conversation to see what common tools catch and miss. Only the author sees the results.
- **Review other people's transcripts** one at a time, anonymously, under a shared review definition, after passing a short instruction check. **Compare** two related transcripts side by side.
- **Enter prizes** by written nomination. The counted awards are tallied automatically.

**For organizers**

- **A live overview**: participants, submissions, review coverage, spend and tokens.
- **A participants table** with per-person counts, tester marking, budgets and account controls.
- **Submission controls**: hold back or withdraw anything that should not be shown to reviewers.
- **Pause chat for everyone** in one click, and set per-person daily token allowances.
- **Edit the terms, review instructions and event settings** without a deploy.
- **Export the whole dataset** as JSONL, with every message, label, review and raw model payload.

**Under the hood**

- Every message and raw provider response is stored in Postgres as it streams, so nothing is lost if a browser closes.
- Sign-up is gated by an event code. Organizer rights are never granted at sign-up.
- Designed for about 60 people chatting at once, with a load-test script to prove it before the day.

---

## A tour

*Screenshots are from a local run with made-up participants and sample model replies.*

### Getting started

| Sign up with the event code | Agree to the terms and answer a few background questions |
| --- | --- |
| ![Sign-up page](docs/screenshots/sign-up.png) | ![Onboarding: terms and background questions](docs/screenshots/onboarding.png) |

### Writing conversations

| Pick a conversation or folder, and a model | Run scanners on your own conversation |
| --- | --- |
| ![Starting a new conversation and choosing a model](docs/screenshots/new-conversation.png) | ![Llama Guard and an LLM judge results in the Scanners tab](docs/screenshots/scanners.png) |

### Reviewing

| Two kinds of review, each with its instructions | One record, one form, with "Skip this one" up top |
| --- | --- |
| ![The Review home page](docs/screenshots/review-home.png) | ![Reviewing a transcript](docs/screenshots/review.png) |

### Organizing

![The organizer console overview](docs/screenshots/organizer-overview.png)

| Participants, ranked by what they've done | Every submission, with hold and withdraw controls |
| --- | --- |
| ![The participants table](docs/screenshots/organizer-participants.png) | ![The submissions list](docs/screenshots/organizer-submissions.png) |

### A built-in briefing

Participants can always go back to **How it works** for the day's rules and prizes, and to the **Infohazard guide** for what must not leave the room.

![The How it works page](docs/screenshots/guide.png)

---

## Run it locally in five minutes

You can try everything without an OpenRouter key: a built-in stand-in provider answers every chat and scanner request, for free.

**You need:** Node 22 or newer (`nvm use` reads `.nvmrc`) and a Postgres database. The quickest database is Docker:

```bash
docker run --name astral-db -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:16
```

A local Postgres install or a free [Neon](https://neon.tech) branch works too.

**1. Install and configure**

```bash
npm install
cp .env.example .env.local
```

Open `.env.local` and set:

| Variable | Value for local use |
| --- | --- |
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/postgres` (for the Docker database above) |
| `BETTER_AUTH_SECRET` | Any random string. `openssl rand -base64 32` makes one. |
| `BETTER_AUTH_URL` | `http://localhost:3000` |
| `OPENROUTER_BASE_URL` | Uncomment it (`http://127.0.0.1:4010/api/v1`) to use the stand-in provider. Leave it commented out to use a real `OPENROUTER_API_KEY`. |
| `ADMIN_EMAILS` | The address you'll sign up with, if you want to be an organizer. |
| `EVENT_CODE` | The code people type to sign up. Defaults to `astral-boston`. |

Every variable is explained in [`.env.example`](.env.example).

**2. Create the tables and starting data**

```bash
npm run db:migrate
npm run db:seed
```

**3. Start the stand-in provider** (skip this if you're using a real key), in its own terminal:

```bash
npm run mock-openrouter
```

**4. Start the app**

```bash
npm run dev
```

Open <http://localhost:3000/sign-up>, create an account with the event code, and you're in.

> The stand-in's replies are obviously fake (`Reply 1 to: ...`). Use a real OpenRouter key to see real model behaviour.

---

## Becoming an organizer

Organizer rights are never handed out at sign-up, because email addresses aren't verified. To make the first organizer:

1. Sign up in the app.
2. Put that address in `ADMIN_EMAILS` in `.env.local`.
3. Run `npm run db:seed` again. It promotes listed accounts that already exist.
4. Sign out and back in. **Organize** now appears in the sidebar.

After that, organizers promote each other from **Organize → Participants**.

---

## Deploying for a real event

Astral runs on Vercel with a Neon Postgres database. **[docs/DEPLOY.md](docs/DEPLOY.md)** walks through a first deploy in about 20 minutes, plus what to check the day before the event.

Before the day, run these against your real key and database:

```bash
npm run check-models     # every model in the list answers on OpenRouter
npm run doctor           # database, schema, models and scanners, end to end
npm run load-test -- 70 3   # 70 simulated participants chatting at once
```

---

## Useful scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Start the dev server (applies pending migrations first) |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:seed` | Seed settings, terms, scanners, and promote `ADMIN_EMAILS` |
| `npm run db:generate` | Generate a migration from schema changes |
| `npm run db:studio` | Browse the database in Drizzle Studio |
| `npm run mock-openrouter` | Start the stand-in provider, so chat works with no API key |
| `npm run check-models` | Check every model against OpenRouter with your key |
| `npm run check-scanners` | Check the scanner models answer correctly |
| `npm run doctor` | Check database, schema, models and scanners end to end |
| `npm run load-test -- 70 3` | Simulate 70 participants chatting at once |
| `npm run set-password` | Set a one-time password for an account, for when nobody can do it from the console |
| `npm run test:e2e` | Run the browser tests |

Each has a `prod:` twin (for example `npm run prod:doctor`) that reads `.env.production.local` and says which database it is about to touch.

---

## Tests

The `e2e/` folder holds Playwright tests that sign up, chat, label, submit, review, nominate and run the organizer console the way a person would, in a real browser against a production build. Replies come from the stand-in provider, so a run needs no API key and costs nothing.

```bash
npx playwright install chromium   # once per machine
npm run test:e2e:prepare          # once per database: tables and seed data
npm run test:e2e                  # run them; add -- --ui to watch
```

The tests use `DATABASE_URL` from `.env.test.local` if it exists, and `.env.local` otherwise. They create accounts at `@e2e.test`, change event settings while running and clean up afterwards, so a separate database is the tidy choice. They never read `.env.production.local`.

CI runs lint, a type check and the full browser suite on every push. See [docs/TESTING.md](docs/TESTING.md).

---

## How it's built

**Stack:** Next.js 16 (App Router, TypeScript) · Tailwind CSS · Better Auth (email and password, admin plugin) · Drizzle ORM · Postgres · Vercel AI SDK with the OpenRouter provider.

One Next.js app talks to Postgres and to OpenRouter for every model call. There's no separate backend, queue or cache.

```
Browser ──▶ Next.js on Vercel ──┬──▶ Postgres (Neon): accounts, messages, raw payloads,
                                │                     submissions, reviews, settings
                                └──▶ OpenRouter ──▶ Anthropic / OpenAI / open-weight models
```

```
app/          Pages and API routes (chat, review, nominate, admin, api/…)
components/   React components for each screen
lib/          Shared logic: models, forms, review rules, OpenRouter calls
db/           Drizzle schema and SQL migrations
scripts/      Seeding, health checks, load test, stand-in provider
e2e/          Playwright browser tests
docs/         Deployment, testing, design and spec documents
```

---

## Further reading

| Document | What's in it |
| --- | --- |
| [docs/DEPLOY.md](docs/DEPLOY.md) | Deploying to Vercel and Neon, and the checklist for the day before |
| [docs/TESTING.md](docs/TESTING.md) | The browser tests and CI |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design, data model, key flows, security and scale |
| [docs/SPEC-V1.1-STATUS.md](docs/SPEC-V1.1-STATUS.md) | What the platform does now, mapped against specification v1.1 |
| [docs/SPEC.md](docs/SPEC.md) | The original product spec (partly superseded by v1.1) |
| [docs/TODO.md](docs/TODO.md) | Open decisions and remaining work |
| [docs/BUILDLOG.md](docs/BUILDLOG.md) | What each build round delivered, with steps to test it yourself |
