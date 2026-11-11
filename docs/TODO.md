# What still needs doing

Two kinds of thing are in here.

**Decisions** need someone who knows the research. I have put a working
default in place for each so the platform runs today, but none of them is
settled and most are mine rather than yours.

**Build work** is mine. It is listed so you can see what is deliberately
unfinished and tell me the order you want it in.

Each item says where it lives, so acting on it is an edit rather than a hunt.
The first section is the only one that actually blocks the event.

---

## Blocking the event

### 1. Terms and conditions — decision

**Placeholder text is live right now.** Four points covering research use of
transcripts, role-play rather than real data, being over 18, and prizes at
the organizers' discretion. It is not legal text and was never meant to be.

Where: **Organize → Terms** in the app. Paste the text, check it in the
preview beside it, publish.

Needed:

- The real agreement, in particular what participants consent to about how
  their transcripts are stored, used and possibly published.
- Whether anything must be said about the nature of the content they will be
  asked to produce.
- Whether a separate data-protection notice is required.

Publishing a new version asks everyone to accept it on their next page,
without refilling anything else, and cannot be undone: a published version
is never edited, because people agreed to that exact text. A correction is
another version.

Do this **before** people sign up, or everyone accepts twice.

### 2. Event-day details in the briefing — decision

The in-app **How it works** page carries the briefing: what the research is
for, the four things a participant does, how the scanners fit in, the prize
table, and what happens to what they write. The front page no longer does;
it was cut to the introduction and the way in. So a visitor learns about
prizes and deadlines only after signing in, or from you on the day.

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

The admin console ranks on raw counts today and shows you each person's work
so you can audit by eye. If you want a rule applied automatically, it needs
defining first.

### 4. Account hygiene — build work, small

- The admin password used for testing is weak and was shared in plain text.
  Change it before the event: **Organize → Participants → Manage** on your
  own row, then **Set password**. Sign-up now refuses passwords like it, but
  that does not reach back to accounts that already exist.
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

From the thread with Colby, not built because you two are still deciding:

- **Reworded labels.** The revised wording is in your Google doc, which I
  cannot open. Paste it to me, or edit `lib/labels.ts` directly: each list
  is a few lines.
- **Two required questions about what the model did**, plus free text,
  instead of the one there is now.
- **A free-text field when "Other" is ticked** under topics. You said you
  would rather limit free text; the cost of not having it is that "Other"
  tells you nothing afterwards.
- **Campaigns**, meaning several conversations grouped as one attempt,
  shown as folders, with some questions asked once per campaign and some
  per conversation. This is the largest of the four: it needs a new table,
  a way to move conversations in and out, and a decision on what a reviewer
  and a prize entry are *of*, a conversation or a campaign. The existing
  Collaborative track already lets an entry name several transcripts, which
  may be enough for this event. Worth settling before I build anything.

### 7. Reviewer labels

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

## Done since the last version of this list

- **The scenario box is removed** from new conversations.
- **The model list is current** as of 11 November 2026. The live site needs
  one press to take it: **Organize → Settings → Switch to the new list**,
  then `npm run prod:check-models`.
- **Look and feel**: serif headings, one sage accent, a paper background.
  The colours are the first few lines of `app/globals.css`.
- **Dropdowns** are our own and match the rest.

Still open on models: whether to add a DeepSeek model under open weight
(left out because OpenRouter does not list its current ones as
open-weight), and whether the scanner should move off Claude Sonnet 4.5.

---

## Build work, not started

Roughly in the order I would do it. None of it blocks the event.

### 9. Admin-editable profile questions

The profile questions live in code (`lib/labels.ts`). Moving them into the
database would let you add, remove and reorder them without a code change.
It needs the profile table to hold answers as structured data rather than
fixed columns, which is a change to how every existing profile is stored. I
would not make it this close to the event: changing a question today is a
one-line edit and a deploy, and the cost of getting a migration of
everyone's profile wrong is much higher than that.

The agreement half of this item is done: see **Organize → Terms**.

### 10. Forgot password by email

Not hard — Better Auth has `requestPasswordReset` and `resetPassword` built
in. The work is almost entirely choosing an email provider and verifying the
domain so the mail is not treated as spam. Half a day, most of it waiting for
DNS. Useless without working email on the day, which is why the event relies
on an organizer resetting passwords instead. Worth adding afterwards.

### 11. Email verification

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
