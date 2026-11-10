# What still needs doing

Two kinds of thing are in here.

**Decisions** need someone who knows the research. I have put a working
default in place for each so the platform runs today, but none of them is
settled and most are mine rather than yours.

**Build work** is mine. It is listed so you can see what is deliberately
unfinished and tell me the order you want it in.

Each item says where it lives, so acting on it is an edit rather than a hunt.
**Up next** is the working priority list and is re-sorted as new asks come
in. Everything below it is reference detail; of that, **Blocking the event**
is the only section that actually stops the day.

---

## Up next

Last re-sorted 2026-11-10, after the Slack threads on testing, labels,
review supply, the Theo call notes and provider bans. Ordered by lead time
first, then by what blocks what.

| # | What | Kind | Size | Status |
|---|------|------|------|--------|
| A | Email OpenRouter safety | Action | 30 min | Not started |
| B | Ask Emre for a second OpenRouter account | Action | 10 min | Not started |
| C | Get the team testing, collect feedback | Action | Ongoing | Not started |
| D | Sign-off on the labeling draft | Decision | 1 conversation | Waiting on Colby and Dev |
| E | Rebuild the three forms to the draft | Build | 2–4 days | Blocked on D |
| F | Second reviews when the pool runs dry | Build | 1 day | Agreed with Colby; build with E |
| G | Replace placeholder text | Writing | 1 day | Feeds from C |
| H | Ground rules for the intro session | Writing | 1–2 hours | Agreed with Dev |
| I | Benign then adversarial, or mixed? | Decision | — | Open |
| J | Attribute requests to users at OpenRouter | Build | 1 hour | Not started |
| K | One OpenRouter key per participant | Build | 2–3 days | Recommend not doing |
| L | Per-turn timestamps | — | — | Already done |
| M | Similar-transcript check | Analysis | After the event | Later |

### A. Email OpenRouter safety — do first

safety@openrouter.ai: what the research is, that the adversarial traffic is
deliberate red-teaming under supervision, the date and expected volume, the
models, and a contact. Approval takes about five business days, so this has
the longest lead time of anything here and costs almost nothing. Mention that
each request carries a per-participant identifier (J) and that organizers can
pause any participant instantly — both make the request easier to grant.

### B. Second OpenRouter account — ask now

A request to Emre. On our side, switching is changing `OPENROUTER_API_KEY` in
Vercel and redeploying, which is a few minutes. Worth having the second key
ready and tested with `npm run check-models` before the day rather than
creating it under pressure. Note budgets and costs are counted in our own
database, so they carry over a switch unchanged.

### C. Team testing and feedback

Ask was: test the platform and feed back on (1) UI and UX, (2) text, all of
which is placeholder, and (3) bugs. What it actually takes:

- Testers need the event code and should sign up with real addresses, not
  `example.com` — those get deleted by item 4's cleanup.
- One shared place to drop feedback (a doc or a Slack thread), so it can be
  triaged in one pass.
- Steer testers away from the labels and review forms until E lands, or the
  feedback is on forms that are about to be replaced. Chat, submitting,
  nominations, the home page and the admin console are all stable.
- Reviewing needs someone else's submitted transcript, so two testers have to
  work together to see the whole loop.

### D. Sign-off on the labeling draft

There is now a working draft of all three forms (intake, self-documentation,
independent review). It settles most of the open questions in items 5–7.
Before building, confirm three things that change more than the forms:

- **Transcript type goes away.** The draft replaces benign / dual use /
  adversarial with *actor posture* on the author side and drops it from the
  review entirely. The admin counts, the benign prize (item 3), the export
  and the scanner rubric (item 8) all key off transcript type today. Agree
  what replaces it — most likely "Legitimate work" counts as benign.
- **"One row per detected refusal" needs a detector.** Nothing detects
  refusals today. Simplest reliable option: the author marks which assistant
  turns were refusals, and judges each one. Automatic detection by the
  scanner is possible but would be wrong sometimes, and the form would be
  wrong with it.
- **"Can't judge this" writes a row.** That means a new record of skipped
  transcripts with a reason, and skipping must release the transcript to
  someone else, not just hide it.

### E. Rebuild the forms to the draft

Three pieces, in order of size:

1. **Intake** — small. Adds hands-on lab experience, biosecurity / DURC
   familiarity and a 1–5 confidence; extends the subdomain list; renames two
   options. One migration on `profile`; existing answers stay valid except
   anyone who chose a renamed option.
2. **Self-documentation** — medium to large. New fields: actor posture, did
   you get what you were after, refusal judgements per turn, missed refusal
   with a message pointer, subject and activity tags split in two. Touches
   `lib/labels.ts`, `lib/labels-schema.ts`, `transcript_labels`,
   `components/labels-panel.tsx`, the submission snapshot, admin counts and
   the export.
3. **Independent review** — large. New fields: escalate to a safety reviewer,
   two separate confidences, misuse becomes yes / no / can't tell, a shorter
   five-way actor list, observable indicators, refusal appropriateness,
   transcript quality, and the can't-judge button. Touches
   `lib/review-schema.ts`, the `review` table and its enums,
   `components/review-panel.tsx`, `lib/reviews.ts` and the admin pages.

The scanner rubric (item 8) should be realigned to the new axes afterwards,
so the three sources stay comparable.

### F. Second reviews when the pool runs dry

The concern: writing a transcript takes far longer than reviewing one, so
reviewers will run out. Colby's answer, agreed: once every transcript has one
review, hand out second reviews; once everything has two, tell reviewers to
go and write transcripts instead.

Today the database allows exactly one review per transcript
(`review_conversation_uq`), so this is a real change:

- Allow up to two reviews per transcript, one per reviewer.
- Batches prefer unreviewed transcripts and fall back to once-reviewed ones,
  never handing someone a transcript they wrote or already reviewed.
- A second reviewer must not see the first review.
- An empty batch says "everything has been reviewed twice — go and write
  more" rather than showing an empty list.
- Admin pages and the export show a list of reviews rather than one.
- Leaderboard counts and item 3 need saying whether a second review counts
  the same as a first.

Do it in the same migration as the review half of E, since both rebuild the
`review` table. Inter-reviewer agreement falls out as a bonus for analysis.

### G. Placeholder text

Every visible string was written as a placeholder. Collect it from testers'
notes (C) and items 1 and 2, then rewrite in one pass rather than piecemeal.
Most of it is in `components/about-astral.tsx` and the form labels in
`lib/labels.ts` and `lib/review-schema.ts`.

### H. Ground rules for the intro session

Agreed in the Theo thread: banning participants from talking is
unenforceable and takes the fun out. Instead, say at the start:

- Talking about approaches is fine; do not copy each other's prompts.
- Be mindful with the models: do not fire clearly toxic or adversarial chats
  back to back. Mix in other work. (This is the main ban mitigation that
  costs nothing.)

These can also go on the How it works page so they are on screen all day.

### I. Benign then adversarial, or mixed?

Open. A morning-benign / afternoon-adversarial split guarantees coverage of
both but concentrates all the risky traffic into a few hours, which is the
pattern most likely to get flagged. Letting people mix freely spreads it out.
Nothing in the app enforces the split either way, so this is a briefing and
schedule decision only (feeds item 2). Mixing does make the benign prize's
16:00 deadline the only time structure left.

### J. Attribute requests to users at OpenRouter

OpenRouter accepts a stable end-user identifier on each request, meant for
exactly this: abuse detection per user rather than per account. Passing the
participant's id (not their name or email) in the chat route and scanner
calls is roughly a one-line change in `app/api/chat/route.ts` and
`lib/judges.ts` — confirm the option name in the provider when doing it.
Gets most of what per-user keys would give for almost none of the work.

### K. One OpenRouter key per participant — recommend not doing

The idea: per-user keys so one key can be disabled. What it would take:
OpenRouter's provisioning API to create a key for each participant at
sign-up, storing them encrypted, picking the key per request in the chat
route and scanners, revoking on pause, plus testing it at load.

Why it is probably not worth it: the platform already stops a participant
instantly (pause or ban on the participants table, checked on every message),
with per-user budgets. Separate keys do not prevent an account ban, which is
the actual risk. J covers the attribution half. Revisit only if OpenRouter
asks for it in reply to A.

### L. Per-turn timestamps — already done

Every message already records `created_at` when it is written, and assistant
messages record `latency_ms` too. Both are in the admin export. Nothing to
build; tell Colby. On the hypothesis: time between turns is a noisy proxy for
effort because people switch tabs, so it is best used in aggregate or to spot
outliers, not per transcript.

### M. Similar-transcript check

Dev's suggestion: after the event, throw out transcripts that look too
similar to each other. An analysis step on the export, not a build. Note it
in the write-up plan.

---

## Blocking the event

### 1. Terms and conditions — decision

**Placeholder text is live right now.** Four points covering research use of
transcripts, role-play rather than real data, being over 18, and prizes at
the organizers' discretion. It is not legal text and was never meant to be.

Where: the `terms_version` table, seeded by `scripts/seed.ts`.

Needed:

- The real agreement, in particular what participants consent to about how
  their transcripts are stored, used and possibly published.
- Whether anything must be said about the nature of the content they will be
  asked to produce.
- Whether a separate data-protection notice is required.

Publishing a new version re-prompts everyone automatically, on their next
page load, without them refilling anything else:

```sql
INSERT INTO terms_version (version, body) VALUES (2, '...the real text...');
```

Do this **before** people sign up, or everyone accepts twice.

### 2. Event-day details on the home page — decision

The front page and the in-app **How it works** page now carry the briefing:
what the research is for, the four things a participant does, how the
scanners fit in, the prize table, and what happens to what they write.

Where: `components/about-astral.tsx`.

What I filled in from our conversations, which you should check:

- Five tracks at $1,000 each.
- Nominations close 15:00; the two counted tracks close 16:00.
- The claim that volume alone will not win the counted tracks.

What is **not** on the page because I do not know it:

- Venue and room.
- Run of day. It currently says nothing beyond the two deadlines.
- The time zone. Every time in the app is shown in Boston time and labelled
  as such. If the event moves, it is one constant: `EVENT_TIME_ZONE` in
  `lib/time.ts`.
- Whether food is provided, wifi details, who to ask for help.

A short schedule is the single biggest improvement left to that page.

### 3. What counts for the two counted prizes — decision

The benign prize is "highest number of quality-controlled normal-course
transcripts". The reviewer prize is the same for reviews. Neither phrase is
precise enough to settle an argument at 16:30.

- **What makes a transcript count?** Submitted at all, submitted and labelled
  benign, or submitted and passed a check?
- **What disqualifies a review?** There is no quality flag on reviews at all
  at the moment, which is worth deciding alongside item 7.
- The labeling draft (D) adds *transcript quality* to the review, which can
  serve as the check for the first question, and removes transcript type,
  so "benign" needs redefining. Second reviews (F) raise whether a second
  review counts the same on the leaderboard.

The admin console ranks on raw counts today and shows you each person's work
so you can audit by eye. If you want a rule applied automatically, it needs
defining first.

### 4. Account hygiene — build work, small

- The admin password used for testing is weak and was shared in plain text.
  Change it before the event.
- Organizer rights are no longer granted at sign-up. The remaining
  organizers get promoted from the participants table once they have signed
  up themselves. `ADMIN_EMAILS` can be removed from Vercel; only the seed
  script reads it now.
- The test accounts need clearing before real data arrives. Your own team
  has already signed up, so delete by address rather than emptying the
  table — every test account I made is at `example.com`:

  ```sql
  DELETE FROM "user" WHERE email LIKE '%@example.com';

  -- A transcript is locked when it is reviewed. Deleting a reviewer deletes
  -- their reviews, so unlock whatever they had reviewed, or its author stays
  -- shut out of a transcript that no longer has a review.
  UPDATE conversation SET locked_at = NULL
  WHERE locked_at IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM review r WHERE r.conversation_id = conversation.id);
  ```

  That removes those accounts and every transcript, review and nomination
  attached to them, leaving your accounts, the settings, the terms and the
  scanner configurations alone.

---

## Decisions that improve the dataset

These are not blocking. Getting them wrong costs you analysis later rather
than stopping the day.

### 5. The intake form

*Mostly answered by the labeling draft — see D and E above. Kept for the
reasoning.*

Where: `lib/labels.ts` — `PROFILE_ROLES`, `DEGREES`, `YEARS_EXPERIENCE`,
`BACKGROUNDS`, `SUBDOMAINS`, `AI_FAMILIARITY`.

Asked at sign-up and editable afterwards from the profile page: name,
affiliation, role, highest degree, years of experience, primary background,
life-science subdomains, familiarity with AI chatbots, optional free note.

- Is **years of experience** banded usefully? Currently 0-1, 2-4, 5-9, 10+.
- Is the **subdomain list** right? Currently virology, bacteriology,
  synthetic biology, molecular biology, immunology, toxicology,
  bioinformatics, biosafety and biosecurity, clinical, other.
- Should **wet-lab versus dry-lab** be asked explicitly? It often matters and
  is currently only implied.
- Is anything here identifying enough to be worth not collecting?

### 6. Self-documentation labels

*Mostly answered by the labeling draft — see D and E above.*

Where: `lib/labels.ts` — `TRANSCRIPT_TYPES`, `ROLE_PRESETS`,
`MODEL_BEHAVIOURS`, `DOMAIN_TAGS`, `CHALLENGE_FLAGS`.

- **Transcript type** is three-way: benign, dual use, adversarial. Still
  right, or is a fourth needed, for example "benign but sensitive"?
- The **role presets** mix professional roles with threat-actor archetypes in
  one list. Two separate questions?
- Are the **topic tags** the right axis? They mix subject matter (virology,
  toxins) with activity (acquisition, lab protocols).
- Should the author be asked **which model behaviour surprised them**, as
  distinct from what it did?

### 7. Reviewer labels

*Mostly answered by the labeling draft, which adds per-answer confidence,
refusal appropriateness and a transcript-quality flag — see D and E above.*

Where: `lib/review-schema.ts` — `REVIEW_INTENTS`, `REVIEW_ACTORS`,
`CONFIDENCE_LABELS`. The newest of these, so the least settled.

- **Confidence is one 1-5 scale** for the whole judgement. Per-answer
  instead, for example separate confidence on intent and on actor?
- Reviewers can answer **"cannot tell"**. Right escape hatch, or force a
  choice?
- Should reviewers judge whether **the model's response was appropriate**, as
  distinct from what the person was attempting?
- Should they be able to flag a transcript as **low quality or not a genuine
  attempt**? That feeds item 3 and there is no way to say it today.
- The **actor list** is the self-label list plus "cannot tell". Reviewers are
  guessing from text alone, so a shorter list may be more reliable.

### 8. Scanner rubric

Where: `scripts/seed.ts` as `LLM_JUDGE_PROMPT`, and `lib/judges.ts` as
`DEFAULT_JUDGE_INSTRUCTIONS`. Rewritten once already, after both scanners
gave confidently wrong answers.

The judge is asked for three things: the person's intent from their messages
alone, what the assistant did about it, and how much capability was actually
provided. These mirror the human label axes on purpose, so the three sources
can be compared.

- Is **uplift 0-10** the right scale, and anchored well enough? It currently
  says 0 for a refusal and 10 for operationally dangerous detail.
- Should the judge name **which turn** was most concerning?

---

## Build work, not started

Roughly in the order I would do it. None of it blocks the event.

### 9. Themed dropdowns

The profile questions, the labels panel and the review form use the browser's
native `<select>`, which renders as the operating system's own dropdown and
looks out of place against everything else. A custom listbox would match the
design. The native control gives keyboard navigation and screen-reader
labelling for free, so a replacement has to keep both.

Where: `components/profile-fields.tsx`, `components/labels-panel.tsx`,
`components/review-panel.tsx`, `components/ui/select.tsx`.

### 10. Admin-editable forms and agreement

The profile questions live in code and the terms in a seeded row. Moving the
question set into the database would let you add, remove and reorder fields
and edit the agreement without a code change. The terms half is mostly UI
since that table is already versioned; the profile half needs the profile
table to hold answers as structured data rather than fixed columns.

### 11. Email format checking and password rules

Sign-up accepts whatever the browser's own email validation allows, which is
lenient, and the only password rule is a minimum of eight characters. Worth
tightening both, especially as there is no password reset by email: a typo in
an address costs someone their account on the day.

### 12. Forgot password by email

Not hard — Better Auth has `requestPasswordReset` and `resetPassword` built
in. The work is almost entirely choosing an email provider and verifying the
domain so the mail is not treated as spam. Half a day, most of it waiting for
DNS. Useless without working email on the day, which is why the event relies
on an organizer resetting passwords instead. Worth adding afterwards.

### 13. Email verification

Better Auth supports it (`requireEmailVerification` plus a send-email hook).
Same dependency on an email provider. Deliberately off for a one-day
in-person event where friction at the door costs more than it prevents.

---

## Decided, not changing

### No document or sequence input

The chat is text only. Participants cannot upload files or paste sequences,
which is deliberate: we do not want people pasting material from their own
labs. The research cost is that the dataset will not contain sequence-
scanning cases, which a real misuse-detection pipeline often cares about.
Worth being explicit about when the dataset is written up.

### Transcripts are never deleted

Nothing in the app deletes a transcript, and submitting creates an immutable
snapshot per version. Participants can revise and resubmit; every version is
kept. This is on purpose, so an analysis can see what changed.
