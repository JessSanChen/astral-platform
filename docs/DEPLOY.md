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
configurations. It is safe to run again: it will not duplicate anything, and
it leaves alone whatever you have since changed in the console. Two flags
make it overwrite on purpose: `-- --limits` puts the allowance and rate
limits back to the values in the code, and `-- --models` replaces the model
list with the one in `lib/models.ts`.

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
| `ADMIN_EMAILS` | Not needed in Vercel. Only the seed script reads it, from `.env.production.local` |
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

1. Sign up with your own address, using the event code. Then run
   `npm run prod:seed` once more: it promotes the addresses in
   `ADMIN_EMAILS` that now have accounts, which is how the first organizer
   comes to exist. Sign out and back in to pick the role up at once.
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
time anything asks for it. The other order does not work: the new code asks
for columns that are not there yet and every page fails until the migration
is run. `npm run prod:doctor` says whether the database is up to date. Adding columns is safe to do while people are
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

## If an account may have been got into

1. **Organize → Activity → Sign everyone out.** Everyone signs in again.
   A password that is too easy to guess no longer works at all, and one
   that is merely too short for an organizer is replaced on the way in.
2. Change your own password, from your profile.
3. Read **Organize → Activity** for what was done, and by which account.
4. In **Organize → Participants**, check who is marked Organizer, and
   remove anyone who should not be.
5. Anyone whose password was changed for them: set a temporary one from
   **Manage** and read it out. They will be asked to replace it.
6. If the export was downloaded by someone who should not have it, that is
   in the activity record too, and is a conversation to have, not a button.

If an organizer cannot sign in, because their password is one the site now
refuses or because they have forgotten it, and there is no other organizer
to set one:

```bash
npm run prod:set-password -- their@address
```

It prints a temporary password, which works once. If nobody is an
organizer at all, `npm run prod:seed` makes organizers of the addresses in
`ADMIN_EMAILS`. Both need the database credentials, which only you hold.

## Moving to specification v1.1 (migrations 0007 to 0009)

This is the one release where the order matters more than usual, because
the new code reads tables the old database does not have.

1. `npm run prod:migrate` first. It adds the new tables, turns every
   existing conversation into a one-session episode, and marks every
   account as needing to answer the new background questions.
2. Then move `main` to the branch and let it deploy.
3. Sign in. You will be asked for the background questions like everyone
   else. Then, in the console:
   - **Policy**: reviewing starts under a placeholder policy, published
     by the migration. Replace it with the real text when you have it.
   - **Settings**: reviews per view (3), whether new submissions are
     released for review automatically (off), whether related versions
     are open (on).
4. During the event someone watches **Submissions**: each new submission
   waits there as Pending until it is given a review level and marked
   Ready. "Release all pending" marks everything waiting as General.

Between step 1 and step 2 the old site keeps working, but anyone who
loads a page is sent to the onboarding form, which on the old code is
the old profile form. Do the two steps a few minutes apart, not hours.

Going back: `main` at the previous commit still runs against the
migrated database for chat and sign-in, since nothing was removed. Its
labels, old review and nomination pages would show old data only.

`docs/SPEC-V1.1-STATUS.md` has the full list of what changed and why.

## The day before the event

- Change `EVENT_CODE` in the admin console to the code you will read out, and
  not before — anyone with the old one can still sign up until you do.
- If **Organize → Settings** offers a newer model list, take it now, not
  during the event: removing a model stops conversations already on it.
- `npm run prod:check-models` and `npm run prod:check-scanners`, so a model
  that has been retired is a thing you find now rather than at 10am.
- Replace the placeholder reference policy, from **Organize → Policy**.
  Reviewing works under the placeholder until you do.
- Replace the placeholder terms, from **Organize → Terms**. They are seeded
  as version 1; publishing a version 2 makes everyone accept it again, so do
  this before people sign up.
- Decide who else should be an organizer and promote them from the
  participants table once they have signed up. Nothing grants the role at
  sign-up any more, so there is no list to get right in advance.
- Delete the test accounts. Deleting a user removes everything attached to
  them and leaves settings, terms and scanner configurations alone. Target
  them by address rather than emptying the table, or you will take the
  organizers' own accounts with them:

  ```sql
  DELETE FROM "user" WHERE email LIKE '%@example.com';
  ```

  Their conversations, submissions, review assignments and answers go
  with them.
