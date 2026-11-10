# Astral Platform

Web platform for a one-day transcript-generation event supporting AI x
biosecurity misuse-scanner research. Participants chat with frontier and
open-weight models through a familiar chat interface, label each
conversation, and submit it. Everything is stored in Postgres for later
experiments.

- Deploying it: [docs/DEPLOY.md](docs/DEPLOY.md)
- Tests and CI: [docs/TESTING.md](docs/TESTING.md)
- Build log and test instructions: [docs/BUILDLOG.md](docs/BUILDLOG.md)
- Open decisions and remaining work: [docs/TODO.md](docs/TODO.md)
- Product spec: [docs/SPEC.md](docs/SPEC.md)
- System design and explainers: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

## Stack

Next.js 16 (App Router, TypeScript) · Tailwind CSS · Better Auth
(email + password, admin plugin) · Drizzle ORM · Postgres · Vercel AI SDK with
the OpenRouter provider.

## Local development

Prerequisites: Node 20+ and a Postgres database (local, Docker, or a Neon
branch).

```bash
npm install
cp .env.example .env.local   # then fill in the values
npm run db:migrate           # create the tables
npm run db:seed              # settings, terms v1, judge configs
npm run dev                  # http://localhost:3000
```

Environment variables are documented in `.env.example`. To become the first
organizer, sign up, then run `npm run db:seed` with your address in
`ADMIN_EMAILS`: the seed promotes listed accounts that already exist. After
that, organizers promote each other from the participants table.

### Useful scripts

| Script              | What it does                                  |
|---------------------|-----------------------------------------------|
| `npm run dev`       | Start the dev server                          |
| `npm run db:generate` | Generate a migration from schema changes    |
| `npm run db:migrate`  | Apply pending migrations                     |
| `npm run db:seed`     | Seed settings, terms, and judge configs      |
| `npm run db:studio`   | Open Drizzle Studio to browse the database   |
| `npm run mock-openrouter` | Fake provider, so chat works with no API key |
| `npm run load-test -- 70 3` | Simulate 70 participants chatting at once |
| `npm run check-models` | Check every model against OpenRouter with your key |
| `npm run doctor`      | Check database, schema, models and scanners end to end |
| `npm run test:e2e`    | Drive the built app in a real browser (see below) |

### End-to-end tests

`e2e/` holds Playwright tests that sign up, chat, label, submit, review,
nominate and run the organizer console the way a person would, in a real
browser against a production build. Replies come from the stand-in provider,
so a run needs no API key and costs nothing.

```bash
npx playwright install chromium   # once per machine
npm run test:e2e:prepare          # once per database: tables and seed data
npm run test:e2e                  # run them; add -- --ui to watch
```

They use the `DATABASE_URL` in `.env.test.local` if that file exists, and the
one in `.env.local` otherwise. The tests create accounts at `@e2e.test`,
change event settings while they run, and clean up afterwards, so a database
of their own is the tidy choice: a second free Neon project, with its pooled
connection string in `.env.test.local`. They never read
`.env.production.local`.

## Build status

Phases 1 to 8 are complete: app scaffold, database schema, authentication,
event-code-gated sign-up, the profile and terms onboarding gate, the chat
itself with model selection, scenarios, streaming, regenerate and full
transcript persistence, the labeling and submit flow with versioned
snapshots, the safety scanner panel, independent review of other
participants' transcripts, self-nomination for the prize tracks, and the
organizer console.

See [docs/BUILDLOG.md](docs/BUILDLOG.md) for what each phase delivered and
step-by-step instructions for testing it yourself. The remaining plan is in
`docs/SPEC.md` section 9.
