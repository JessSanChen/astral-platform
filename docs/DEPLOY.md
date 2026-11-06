# Deploying Astral

Written for the first deploy, which takes about twenty minutes and needs no
domain. The second half covers what changes once you want one.

## What you are setting up

| Piece | Choice | Why |
|---|---|---|
| Hosting | Vercel | It is made by the people who make Next.js, and this app uses Next 16 features (Server Actions, streaming) that work there with no configuration. Free tier is enough for 60 people for a day. |
| Database | Neon Postgres | Already what you develop against. Serverless, so it costs nothing while idle, and its pooler is what `db/index.ts` is written for. |
| CI/CD | Vercel's own Git integration | Push to the branch, it builds and deploys. There is no pipeline to write. |
| Domain | None today | Vercel gives you `your-project.vercel.app` for free, with HTTPS. |

## Do you need a domain today?

No. Vercel hands you a free address on its own domain the moment you deploy —
that is what "provider subdomain" means. It is a real, public, HTTPS address
your team can open from anywhere. `astral-platform.vercel.app` is a perfectly
respectable thing to send round for a test.

Buy a domain when you want the event-day address to look like yours, or when
you want it to outlive this project. It is a ten-minute change later and
nothing about the app has to move. See the bottom of this file.

---

## First deploy

### 1. Create the production database (5 min)

In the Neon console, create a **new project** — not a new branch of your dev
one. Production and development should not share a database: a test account
or a seed script run against the wrong one is a bad afternoon.

- Region: **US East (Ohio or Virginia)**. Pick the one nearest the venue.
  Every query the app makes crosses this gap, so it sets the floor on how
  fast the app can feel.
- Copy the **pooled** connection string, the one with `-pooler` in the host.
  `db/index.ts` sets `prepare: false` precisely because it expects the pooler.

### 2. Apply the schema and seed it (3 min)

Every `db:` command reads `.env.local`, which is your own development
database. Production values go in `.env.production.local`, which git ignores
like every other env file, and the `prod:` commands read that instead.

Create it now, in the project root:

```
DATABASE_URL=<neon-pooled-url>
BETTER_AUTH_SECRET=<openssl rand -base64 32>
BETTER_AUTH_URL=https://your-project.vercel.app
OPENROUTER_API_KEY=sk-or-v1-...
ADMIN_EMAILS=you@example.com
EVENT_CODE=<pick-one>
```

Then:

```bash
npm run prod:migrate
```

```bash
npm run prod:seed
```

Each prints the database it is about to touch before it does anything —
`neon-xyz.aws.neon.tech/neondb`, not a password — because the mistake that
matters here is doing the right thing to the wrong database.

The seed writes the event settings, version 1 of the terms, and the scanner
configurations. It is safe to run again; it will not duplicate anything.

A shell variable still beats the file for a one-off, so
`DATABASE_URL="..." npm run db:migrate` works when you want to point at
something that is neither of these.

Migrations are run by hand on purpose. Wiring them into the build means every
preview deployment migrates production, which is how a half-finished schema
change reaches the real database.

### 3. Deploy (5 min)

1. Go to vercel.com, sign in with GitHub, **Add New → Project**, and pick the
   `astral-platform` repository.
2. Under **Git**, set the production branch to the branch you are shipping
   from. Vercel defaults to `main`.
3. Leave the build settings alone. It detects Next.js.
4. Add the environment variables below, all for **Production** (and tick
   Preview too, except `BETTER_AUTH_URL` — see step 5).

| Variable | Value |
|---|---|
| `DATABASE_URL` | The Neon **pooled** connection string |
| `BETTER_AUTH_SECRET` | A fresh one: `openssl rand -base64 32`. Not the one from your laptop. |
| `OPENROUTER_API_KEY` | Your OpenRouter key |
| `ADMIN_EMAILS` | Your email, comma-separated for more |
| `EVENT_CODE` | The same code you seeded |
| `BETTER_AUTH_URL` | Fill in after the first deploy, step 5 |

**Do not copy `OPENROUTER_BASE_URL` from `.env.local`.** It points at the mock
provider on your own machine. In production it must be unset, or every reply
in the app will fail.

5. Deploy. When it finishes, copy the address Vercel gives you, set
   `BETTER_AUTH_URL` to it (`https://...`, no trailing slash), and redeploy.
   Sign-in checks the browser's origin against this value, so until it is set
   correctly sign-up fails with "Invalid origin".

### 4. Check it (5 min)

```bash
npm run prod:doctor
```

Then in the browser, on the deployed address:

1. Sign up with the email in `ADMIN_EMAILS`, using the event code.
2. Finish onboarding, send one message, and watch it stream.
3. Open the Scanners tab and run both.
4. Submit the transcript with labels.
5. Visit `/admin`. You should be let in.

If replies fail, it is almost always `OPENROUTER_BASE_URL` left set, or a key
without credit. `npm run prod:check-models` tells you which.

---

## How deploying works from here

Vercel watches the repository. There is no pipeline file to maintain.

- **Push to the production branch** → builds and goes live at your address.
- **Push to any other branch, or open a pull request** → builds a preview at
  its own address, which does not touch production. The app is written to
  trust these addresses for sign-in (`lib/auth.ts`), so you can actually use
  one to test.
- **A failed build never replaces what is live.** The previous deployment
  stays up.
- **Rolling back** is a button: Vercel's Deployments list, pick the last good
  one, Promote to Production. Faster than reverting a commit, and worth
  knowing before the event rather than during it.

Previews share whatever database you give them. Point them at a **separate
Neon project** — the free tier allows several — or they will write test
accounts into the data you are collecting.

### When a change touches the schema

Still by hand, in this order:

```bash
npm run db:generate
```

```bash
npm run prod:migrate
```

Then push. Migrating before the code ships means the new column exists by the
time anything asks for it. Adding columns is safe to do while people are
using the app; renaming or dropping one is not, so if that comes up before
the event, do it between sessions.

---

## Getting a domain, later

1. Buy one from Namecheap, Cloudflare or Porkbun. A `.org` or `.com` is about
   $12 a year. Cloudflare sells at cost and is the least likely to upsell you.
2. In Vercel: **Project → Settings → Domains → Add**, and type it in.
3. Vercel shows you two or three DNS records. Copy them into your registrar's
   DNS page. If you bought from Cloudflare, that is Cloudflare's dashboard.
4. Wait. Usually minutes, occasionally an hour. HTTPS is issued automatically.
5. Change `BETTER_AUTH_URL` to the new address and redeploy, or sign-in will
   refuse requests coming from it.

The old `.vercel.app` address keeps working, so nothing breaks in the gap.

---

## The day before the event

- Change `EVENT_CODE` in the admin console to the code you will read out, and
  not before — anyone with the old one can still sign up until you do.
- `npm run prod:check-models` and `npm run prod:check-scanners`, so a model
  that has been retired is a thing you find now rather than at 10am.
- Replace the placeholder terms. They are seeded as version 1; publishing a
  version 2 makes everyone accept it again, so do this before people sign up.
- Decide who else needs `ADMIN_EMAILS`. It only takes effect at sign-up, and
  the seed promotes listed emails that already exist, so run the seed again
  after adding someone.
- Delete the test accounts. Deleting a user removes everything attached to
  them and leaves settings, terms and scanner configurations alone. Target
  them by address rather than emptying the table, or you will take the
  organizers' own accounts with them:

  ```sql
  DELETE FROM "user" WHERE email LIKE '%@example.com';
  ```
