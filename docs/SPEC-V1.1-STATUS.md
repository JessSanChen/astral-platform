# Specification v1.1: what was built

This maps `docs/spec/ASTRAL_Hackathon_Central_Spec_v1.1.html` onto the code,
section by section. Read it beside the specification to audit the work.

Three kinds of entry:

- **Built**: done as the specification says.
- **Changed**: done differently, with the reason.
- **Not built**: left out, with the reason.

All of it is on the branch `claude/biosecurity-transcript-platform-tgu67r`.
`main`, and the live site, are untouched until you move them.

## Decisions that need your eye

These are the places where I chose something the specification did not
settle, or went against it. Each is a small change to reverse.

1. **Reviewers judge under one shared review definition, not a policy
   of rules.** This follows the organizer's revision to the specification
   ("shared review definition"). The exact text is published by migration
   0011 and shown before the first review and beside every one. What is
   judged is the user's visible activity; whether the assistant answered
   or refused is not evidence either way. There is no menu of rules to
   cite (C05 is gone), and only the user's messages can be chosen as
   evidence. The instruction check has the revision's five questions.
   Reviews record the instruction version and the form version (`C-2.0`),
   so they are distinguishable from anything made under the earlier
   rule-based form (`C-1.1`). The text can be replaced from **Organize →
   Review instructions**, with a warning that it is meant to stay fixed.
   See "The shared review definition" below.

2. **There is no routing: every submission is open to every reviewer.**
   The specification has organizers set a review level and subject areas
   for each submission and match reviewers on their self-rated familiarity
   (5.1 to 5.3). The organizer judged that infeasible to do live, so it is
   removed. A submission is available the moment it is submitted, to anyone
   who has passed the instruction check. The review form opens with a
   prominent "Skip this one" for a record outside the reviewer's
   expertise, and that is how expertise is handled. Two rules are
   unchanged: nobody reviews their own work, and nobody is shown two
   things from the same piece of work and its related versions.
   **Organize → Submissions** keeps one control per submission: hold it
   back or withdraw it, for the case where it should not be shown at all.
   The self-rating on the intake form is still collected and still stored
   with each assignment, as a description of the reviewer.

3. **Copying and pasting is still recorded.** The specification says "No
   clipboard-history" (6.2). You asked for this logging two rounds ago, so
   I kept it and the briefing tells participants it happens. If the
   specification wins, the change is to stop mounting `useClipboardLog` in
   three components; say so and I will remove it.

4. **Participants still choose a model.** The specification assumes one
   assistant setup. The model is chosen on the New page, with none
   chosen in advance, because the event offers ten models. It is fixed
   for a session; the sessions of a folder can each use a different one.
   A related version starts on its source's model.

5. **Participants can run the scanners on their own conversations.**
   The specification has no author-side feedback from monitors, and they
   were hidden when v1.1 was first built, because a verdict shown to an
   author can steer what they write and how they answer "do you expect a
   reviewer to refer this?". The organizer asked for them back. The side
   panel has a Scanners tab beside Details, as before v1.1. Results are
   visible only to the person who ran them, and are never shown to a
   reviewer or used in recording or adding up reviews.

6. **Authors label their own work, with new questions.** The
   specification replaced the old labels with provenance, an optional goal
   note and independent review. The organizer asked for required author
   labels back, in a new form: the role taken, the kind of task
   (multi-select), the scenario, and what the author expects a reviewer to
   decide and how confidently. They are answered in the side panel and
   are required to submit; the free-text goal stays optional. Reviewers
   never see them: a reviewer's view is built from the messages alone.
   The questions are in `lib/author-labels.ts`; the answers are stored on
   the episode (`author_labels`, migration 0009) and exported. A folder
   is asked two of them for the folder as a whole (role and kind of
   task) when it is started, and each of its sessions answers the full
   set for itself, starting from the folder's answers; those are stored
   on the session (migration 0015).

7. **Everyone answers the new background questions once.** The old
   profile cannot be mapped onto form A, so migration 0007 marks every
   existing account as not yet onboarded. Old answers stay in the database.

8. **Review coverage will be thin for folders.** The specification asks
   for three reviews of every view, and never shows one person two views
   from the same family. A folder of three sessions has four views (three
   sessions and the linked view), so it needs twelve different reviewers,
   and a related version adds more to the same family. With about sixty
   people, expect many views to stay *Pending*. The target is a setting
   (**Reviews per view**); lowering it to 2 on the day is a reasonable
   response. Nothing relaxes the rules by itself.

## Before the event

In this order:

1. Run the migration, then deploy (see `docs/DEPLOY.md`). The migration
   must go first.
2. **Organize → Review instructions**: nothing to do. The shared
   definition is published by the migration. Change it only if you must.
3. **Organize → Terms**: the real study information, if it has changed.
4. **Organize → Settings**: reviews per view, whether submissions are
   released automatically, and whether related versions are open yet.
5. Decide who watches **Organize → Submissions** during the event.

## Section by section

### 1. What the platform does

| Item | Status | Where |
| --- | --- | --- |
| Flow: intake, write, submit once, review one item at a time | Built | whole app |
| Objects: session, episode, folder, related version, view, assignment | Built | `db/schema.ts`, migration `0007` |
| Chat layout with sessions listed | Built | `components/chat-sidebar.tsx`, `components/episode-panel.tsx` |
| Review layout: record, all questions on one screen, Skip, Pause | Built | `components/review-workspace.tsx` |
| No "refresh for new content" button | Built | one item at a time; reload resumes it |

A *session* is a row of the existing `conversation` table, so chat, budgets
and the message log work as before. An *episode* groups one or more
sessions. Existing conversations each became a one-session episode.

### 2. Forms

| Form | Status | Where |
| --- | --- | --- |
| A. Intake (A01 to A07) | Changed at the organizer's request; see "Intake form, as revised" below | `lib/intake.ts`, `components/intake-fields.tsx`, `app/onboarding` |
| A01 two required agreements, optional public release | Built | `components/onboarding-form.tsx` |
| B1 provenance: real or invented | Removed at the organizer's request (round 32): no longer asked. Answers given earlier are kept | columns `episode.task_provenance` and the session's labels still exist |
| B2 optional activity template, optional goal note | Changed: the templates are gone at the organizer's request; the goal note is in the side panel, with whether work had begun kept in `episode_goal_revision` | `components/episode-panel.tsx` |
| B3 related version: intent and intended difference | Built | `app/chat/related/[episodeId]`, `components/related-version-form.tsx` |
| R. Instruction check | Changed by the revision: its five questions, R01 to R05 | `components/instruction-check.tsx`, `lib/review-form.ts` |
| C. Independent review (C04 to C13) | Built | `components/review-workspace.tsx`, `lib/review-form.ts` |
| C05 policy basis | Removed by the revision | the column still exists and holds `not_asked` |
| C-S. Skip with a reason | Built | `components/review-skip.tsx` |
| D. Comparison audit (D01 to D06) | Changed at the organizer's request: three questions (same topic or task, similarity of technical scope, main substantive difference) and an optional note, form `D-2.0`; its own instructions are shown under its button | `components/pair-audit-workspace.tsx` |
| N. Prize entry, up to three | Not built, at the organizer's request: prizes are entered by written nomination, as before v1.1 | `/nominate` (the Submit page), `lib/nominations.ts` |
| Form versions stored with every answer | Built | `intake_version`, `form_version`, `policy_version` columns |
| Review drafts saved for recovery | Changed | kept in the reviewer's browser, not on the server; survives reload and pause, not a change of laptop |

Stored values are the specification's own identifiers (`g0` to `g3`, `a0`
to `a3`, `F0` to `F3`, `yes` / `no` / `indeterminate`, and so on).

#### Intake form, as revised (form version A-1.3)

After trying the form, the organizer asked for it to be simpler. What
differs from the specification's form A:

| Specification | Now | Effect on the data |
| --- | --- | --- |
| A02 asks one of three answers first, then shows the areas | The areas are always shown, with "No specialized background" and "Prefer not to say" in the same list; either of those ticked with an area is refused | None: the stored `backgroundResponse` is worked out from what was ticked |
| A05 is a separate section with its own three-way answer | What a person could assess is asked directly under the areas they ticked, for up to three | `familiarity` is stored as before; `familiarityResponse` is worked out (rated, nothing rated, or prefer not to say). Someone who ticks areas and rates none gets general items only |
| A03 role is optional | Required, and asked first, with no "Prefer not to say" | No missing roles |
| A02 primary area and narrower specialization | Removed | Not collected |
| A04 has eight kinds of work, a "prefer not to say" for the whole question and one per row | Five rows, each answered: the rows for writing, teaching and "other" are gone, and so is "prefer not to say" | Those three are not collected; no declined rows |
| A07 use of AI assistants is optional | Required, with no "Prefer not to say" | No missing answers |
| A06 biosafety and biosecurity experience | Removed | Not collected. Routing never used it |
| Focus tags: AI safety; biosecurity and dual-use assessment; biosafety; optional | AI safety; Biosecurity; Neither. One of them has to be ticked | One tag where there were two; "Neither" is stored as no tags |
| Group heading "Related technical fields" | "Other technical fields" | Label only |

Years of experience in each subject are not asked, in the specification
or here. A04 asks for experience by kind of work, and the F0 to F3 rating
is what routing uses.

#### The shared review definition (revision to v1.1)

The organizer's revision replaces the rule-based reference policy. What
it asks for, and where it is:

| Revision | Status | Where |
| --- | --- | --- |
| The exact reviewer-facing instructions, shown at onboarding and within reach on the review screen | Built | `lib/policy.ts` (`SHARED_REVIEW_DEFINITION`), migration 0011; the Review page; a fold-out beside the form with a one-line reminder above it |
| One instruction version for all reviews, stored on each | Built | `review_response.policy_version`, exported also as `review_instruction_version` |
| Five-question check, R01 to R05, with retries | Built | `lib/review-form.ts` |
| Verdict: Yes / No / Cannot determine, with the revision's question | Built | form C |
| Confidence, with the revision's wording | Built | form C |
| Rationale | Changed at the organizer's request: optional | form C; stored as an empty string when left out |
| Uncertainty reasons | Removed at the organizer's request | not asked; the column holds an empty list |
| g0 to g3 and a0 to a3 shown as codes | Changed: the choices are shown in words only; the codes are still what is stored | form C |
| Evidence: user messages only; "No specific affirmative evidence / overall pattern" for No or Cannot determine | Built | only the user's turn numbers are buttons; the server drops any number that is not a user message, and refuses "no specific evidence" for Yes |
| Optional opposing user-turn references | Not built | the revision makes it optional |
| Sensitivity and aim scales kept (g0 to g3, a0 to a3) | Built | form C; no referral is computed from them |
| Policy basis, rule menus, rule configuration removed | Built | removed from the form, the server and the console |
| Assistant messages stay visible; nothing redacted | Built | the record is shown whole |
| No platform field derived from refusals | Built | nothing reads refusals, finish reasons or scanner output when recording or adding up reviews |
| Old rule-based labels distinguishable in the export | Built | `form_version` (`C-1.1` against `C-2.0`) and the instruction version |
| `policy_ready` meaning | Kept, renamed in meaning | `user.policy_ready_version` now means the instruction check was passed for that version |
| Author self-label (section 5 of the revision) | Built differently | the organizer asked separately for required author labels, including the expected referral and confidence, answered before submitting; see decision 6 |

The table, the columns and the console address keep the word "policy"
(`review_policy`, `policy_version`, `/admin/policy`) to avoid a migration
that renames them. They mean the review instructions.

### 3. Generation and folders

| Item | Status | Where |
| --- | --- | --- |
| Append-only chat: no edit, regenerate or branch | Built, refused by the server | `app/api/chat/route.ts` (`append_only`) |
| One reply at a time; a double click cannot send twice | Built | same (`reply_in_flight`) |
| User text saved before the provider is called | Built (already so) | same |
| Failed or cut-short replies stay in the record | Built | `lib/episodes.ts` (`submitEpisode`) |
| Submitting while a reply is being written is blocked | Built | `lib/episodes.ts` (`replyInFlight`) |
| No silent model fallback | Built (already so) | setting stays off |
| A new session starts with no history and no notes | Built | each session is its own conversation |
| A standalone conversation becomes a folder when a session is added | Built | `lib/episodes.ts` (`addSession`) |
| One final submission freezes the whole episode | Changed at the organizer's request (round 32): a session of a folder can also be submitted by itself, which closes that session and leaves the folder open; the folder is still submitted once, as a whole | `submitEpisode`, `submitSession`; empty sessions are left out |
| Linked view: all sessions in the order things happened, sessions named A, B, C | Built | `review_view` rows written at submission |
| Technical retry recorded as a retry | Not built | there is no retry button; a failed reply is followed by a new message |

### 4. Matched sets (related versions)

| Item | Status | Where |
| --- | --- | --- |
| Related version only from a submitted source | Built; the source is one conversation, which may be a session of a folder | button reads "Submit source and create related version" on a draft |
| New empty episode, starting on the source's model, linked to the exact source | Built; always a single conversation, and the link is between the two conversations whatever folders they are in (round 32) | `related_version.source_conversation_id` / `target_conversation_id`, `episode.source_family_id` |
| Source cannot change afterwards | Built | submitted work is locked |
| Same verdict on both versions is kept | Built | nothing deletes or scores pairs |
| One audit per pair as the event minimum | Built | unique index on the pair |

### 5. Reviewer routing

| Item | Status | Where |
| --- | --- | --- |
| Review level and subject areas per submission | Removed at the organizer's request | every submission is stored as General |
| Ready / Held / Withdrawn | Built: available on arrival; an organizer can hold, withdraw or restore | Organize → Submissions |
| General, Routine (F2 or F3 in a listed subject), Specialist (F3) | Removed at the organizer's request | reviewers are not matched on subject knowledge; they skip instead |
| "Other" and the focus tags never grant eligibility | No longer applies | nothing grants or limits eligibility |
| A submitted review is final | Changed at the organizer's request (round 33): a reviewer can reopen a finished review or comparison and change it. Every earlier version is kept, the first as version 1, so first answers can still be analysed alone | `review_revision`, `revised_at`, `revision_count` |
| One active item per reviewer, enforced by the database | Changed at the organizer's request: one transcript review and one comparison can be in progress together, never two of a kind | unique index `review_assignment_one_active_uq` on reviewer and kind (migration 0016) |
| Never your own work; never two views from one family | Built | unique index `review_assignment_family_uq` plus the selection query |
| Exposure recorded when the item is handed over | Built | the assignment row is the record; skips and expiries are kept |
| Least-reviewed first, random among ties | Built | `requestAssignment` |
| Reservation expires after a set time | Built | setting, default 45 minutes |
| No eligible work: says so, relaxes nothing | Built | `components/review-start.tsx` |
| Three reviews per view; Refer / Do not refer / Unresolved / Pending | Built | `panelOutcome` in `lib/review-form.ts`; all votes kept |
| A held record cannot take a review already in progress | Built | `submitReview` |
| Pair audit: eligible for both, not exposed to either | Built | `requestAssignment` (pair branch) |
| A different level for one session of a folder | No longer applies | there are no levels |
| Automated topic suggestions | Not built | the specification makes them optional |

### 6. Data contract

| Item | Status | Where |
| --- | --- | --- |
| Reviewer sees the assigned view only: no author, title, goal, provenance, model | Built | `loadAssignment` returns nothing else |
| Auditor sees both versions and the intended difference only | Built | same |
| Hidden fields absent from responses, not just from the page | Built | they are never loaded for those pages |
| Submitted messages, submissions and reviews cannot change | Built | server-side checks; a second click on Submit changes nothing |
| Policy changes make a new version; answers keep theirs | Built | `review_policy`, `review_response.policy_version` |
| Research export with views, labels, families, provenance, goal timing, routing, skips | Built | the export links on Organize → Settings (`app/api/admin/export/route.ts`) |
| Drafts not mislabelled as completed | Built | `status` on every exported episode |
| No clipboard history | Changed | kept at your earlier request; see decision 3 |
| Restricted backups and a tested restore | Not built | this is the database host's backup (Neon); not something the app does |

### 7. Participant instructions

| Item | Status | Where |
| --- | --- | --- |
| Welcome and generation instructions | Built | `components/about-astral.tsx` (How it works) |
| Review instructions | Built | the Review page, the instruction check, and How it works |
| Comparison activity switched on separately | Built | setting **Related versions open** |
| Recording which instructions each person saw, and when | Partly | the policy version each reviewer passed the check on is stored; page views are not |

### 8. Prizes

The organizer set six awards in place of the specification's four, with
written nominations in place of a mark on submitted work.

| Award | Type | How it is entered |
| --- | --- | --- |
| Most Qualified Transcripts | Quantitative | No entry. Counted from submitted work; Organize → Participants sorts by it. Whether a conversation is distinct, substantive and usable is the organizers' call |
| Most Qualified Reviews | Quantitative | No entry. Counted from completed transcript reviews, on the same page (sort by Transcript reviews); quality is the organizers' call |
| Most Qualified Comparisons | Quantitative, smaller prize pool | No entry. Counted from completed comparisons of related conversations, on the same page (sort by Comparisons) |
| Best Investigation: Matched Set | Qualitative | A written entry on the Submit page |
| Best Investigation: Multi-Session | Qualitative | A written entry on the Submit page |
| Best Investigation: General | Qualitative | A written entry on the Submit page. A catch-all: any investigation, benign use included |

An entry is a headline and the finding in detail (the optional link to
slides was removed in round 30), one per award, editable until nominations are closed from
**Organize → Nominations**. The awards and the wording shown for each are
one list in `lib/nominations.ts`. Amounts and deadlines are not stated;
the briefing says the organizers will announce them. Scoring happens
outside the platform, from the console and the export.

### 9. Acceptance tests

The specification's list (9.2), and the end-to-end test that covers each.
Run them with `npm run test:e2e`.

| Specification test | Covered by |
| --- | --- |
| Start original task: only real/invented required | `authoring.spec.ts`, first test |
| Start folder with blank goal | `authoring.spec.ts`, folder test |
| Add goal after several turns | `authoring.spec.ts`, "adding a session" test |
| Add second session to a standalone draft | same |
| Distinctive private goal string absent from assistant and reviewer | `authoring.spec.ts` first test; `review.spec.ts` second test |
| New session in folder sees no sibling history | `authoring.spec.ts`, folder test |
| Related-version button on a draft | `authoring.spec.ts`, related version test |
| Edit / regenerate attempt rejected by the server | `authoring.spec.ts`, second test |
| Clarifying follow-up appended | every test that sends two messages |
| Folder sessions keep event order and neutral names | `authoring.spec.ts`, folder test |
| Review refreshed: same item and draft | `review.spec.ts`, "reload or a pause" |
| Reviewer skips | `review.spec.ts`, skip test |
| Reviewer pauses | `review.spec.ts`, "reload or a pause" |
| No eligible work | `review.spec.ts`, first test |
| General reviewer gets general items only; F2 gets routine in subject only | `review.spec.ts`, subject knowledge test |
| One person has seen a session or variant | `review.spec.ts`, second and comparison tests |
| All C fields visible, incomplete refused | `review.spec.ts`, second test |
| Staff places item on Hold | `review.spec.ts`, "no place left" test |
| Report-a-problem route | Not implemented, as specified |
| Two browser tabs request work | enforced by the database index; not separately tested in a browser |
| Send double-click | enforced by the server; not separately tested in a browser |
| Submit while a reply is active | enforced by the server; not separately tested in a browser |
| Three votes Yes / No / Indeterminate gives Unresolved | `panelOutcome`; shown on Organize → Submissions |

## How to follow the changes

Each stage is one commit on the branch, in this order:

1. data model and migration
2. intake (form A)
3. writing: provenance, folders, append-only chat, submission, related versions
4. reviewing: policy, instruction check, form C, skip, routing; comparison audit
5. prizes page and the How it works text (the prizes page was later replaced by the earlier nominations)
6. organizer console and export
7. tests and documents

`git log --oneline main..claude/biosecurity-transcript-platform-tgu67r`
lists them, and `git show <commit>` shows one. A pull request from the
branch into `main` gives the same thing in the browser, commit by commit.
