# Astral Platform

Web platform for a one-day transcript-generation event supporting AI x
biosecurity misuse-scanner research. Participants chat with frontier and
open-weight models through a familiar chat interface, label each
conversation, and submit it. Everything is stored in Postgres for later
experiments.

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

Environment variables are documented in `.env.example`. The admin role is
granted automatically to any email listed in `ADMIN_EMAILS` when that user
signs up.

### Useful scripts

| Script              | What it does                                  |
|---------------------|-----------------------------------------------|
| `npm run dev`       | Start the dev server                          |
| `npm run db:generate` | Generate a migration from schema changes    |
| `npm run db:migrate`  | Apply pending migrations                     |
| `npm run db:seed`     | Seed settings, terms, and judge configs      |
| `npm run db:studio`   | Open Drizzle Studio to browse the database   |

## Build status

Phase 1 complete: app scaffold, database schema and migrations, Better Auth
email/password with the admin plugin, event-code-gated sign-up, and the
onboarding redirect gate. See the build plan in `docs/SPEC.md` section 9.
