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

## Starting over

To wipe all accounts and their data while keeping settings, terms and judge
configurations, run this in a SQL console:

```sql
DELETE FROM "user";
```

Everything belonging to those accounts is removed with them.
