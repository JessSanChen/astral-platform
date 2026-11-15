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

1. **The reference policy is a placeholder until you publish one.**
   The specification says not to invent the rules (2.C, 9.1), so none are
   invented. Reviewing does not open until an organizer publishes a policy
   from **Organize → Policy**: the text reviewers read, and the list of
   rules they can cite. See "Before the event" below.

2. **New submissions wait for an organizer.** A submission starts as
   *Pending* with no review level, and nobody is offered it until someone
   sets a level and marks it *Ready* on **Organize → Submissions**
   (specification 5.3). That is real work during the event. If you would
   rather everything went out at once as a *General* item, there is a
   switch on **Organize → Settings**, off by default, and a "release all
   pending" button on the Submissions page.

3. **Copying and pasting is still recorded.** The specification says "No
   clipboard-history" (6.2). You asked for this logging two rounds ago, so
   I kept it and the briefing tells participants it happens. If the
   specification wins, the change is to stop mounting `useClipboardLog` in
   three components; say so and I will remove it.

4. **Participants still choose a model.** The specification assumes one
   assistant setup. The model picker stays, because the event offers ten
   models; the model is fixed for a conversation or folder, and a related
   version always uses its source's model.

5. **The automated scanners are hidden from participants.** Their
   endpoints answer organizers only. The specification has no author-side
   feedback from monitors, and showing a verdict would steer what people
   write.

6. **Authors no longer label their own work.** Forms for transcript type,
   role, model behaviour, topics and evidence turns are gone, as the
   specification replaces them with provenance, an optional goal note, and
   independent review.

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
2. **Organize → Policy**: paste the reference policy and its rules, one
   per line as `ID | label | answers`. At least one rule must support Yes.
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
| A. Intake (A01 to A07) | Built | `lib/intake.ts`, `components/intake-fields.tsx`, `app/onboarding` |
| A01 two required agreements, optional public release | Built | `components/onboarding-form.tsx` |
| B1 provenance: real or invented | Built | `components/new-conversation.tsx` |
| B2 optional activity template, optional goal note | Built | same; goal edits kept in `episode_goal_revision` with whether work had begun |
| B3 related version: intent and intended difference | Built | `app/chat/related/[episodeId]`, `components/related-version-form.tsx` |
| R. Instruction check, four questions | Built | `components/instruction-check.tsx`, `lib/review-form.ts` |
| C. Independent review (C04 to C13) | Built | `components/review-workspace.tsx`, `lib/review-form.ts` |
| C05 policy basis from a versioned policy | Built, rules are yours to supply | `lib/policy.ts`, Organize → Policy |
| C-S. Skip with a reason | Built | `components/review-skip.tsx` |
| D. Comparison audit (D01 to D06) | Built | `components/pair-audit-workspace.tsx` |
| N. Prize entry, up to three | Built | `/prizes`, and a tick box beside submitted work |
| Form versions stored with every answer | Built | `intake_version`, `form_version`, `policy_version` columns |
| Review drafts saved for recovery | Changed | kept in the reviewer's browser, not on the server; survives reload and pause, not a change of laptop |

Stored values are the specification's own identifiers (`g0` to `g3`, `a0`
to `a3`, `F0` to `F3`, `yes` / `no` / `indeterminate`, and so on).

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
| One final submission freezes the whole episode | Built | `submitEpisode`; empty sessions are left out |
| Linked view: all sessions in the order things happened, sessions named A, B, C | Built | `review_view` rows written at submission |
| Technical retry recorded as a retry | Not built | there is no retry button; a failed reply is followed by a new message |

### 4. Matched sets (related versions)

| Item | Status | Where |
| --- | --- | --- |
| Related version only from a submitted source | Built | button reads "Submit source and create related version" on a draft |
| New empty episode on the same model, linked to the exact source | Built | `related_version`, `episode.source_family_id` |
| Source cannot change afterwards | Built | submitted work is locked |
| Same verdict on both versions is kept | Built | nothing deletes or scores pairs |
| One audit per pair as the event minimum | Built | unique index on the pair |

### 5. Reviewer routing

| Item | Status | Where |
| --- | --- | --- |
| Review level and subject areas per submission | Built | Organize → Submissions |
| Ready / Held / Withdrawn / Pending | Built | same |
| General, Routine (F2 or F3 in a listed subject), Specialist (F3) | Built | `lib/assignments.ts` (`levelAllows`) |
| "Other" and the focus tags never grant eligibility | Built | same (`familiarity`) |
| One active item per reviewer, enforced by the database | Built | unique index `review_assignment_one_active_uq` |
| Never your own work; never two views from one family | Built | unique index `review_assignment_family_uq` plus the selection query |
| Exposure recorded when the item is handed over | Built | the assignment row is the record; skips and expiries are kept |
| Least-reviewed first, random among ties | Built | `requestAssignment` |
| Reservation expires after a set time | Built | setting, default 45 minutes |
| No eligible work: says so, relaxes nothing | Built | `components/review-start.tsx` |
| Three reviews per view; Refer / Do not refer / Unresolved / Pending | Built | `panelOutcome` in `lib/review-form.ts`; all votes kept |
| A held record cannot take a review already in progress | Built | `submitReview` |
| Pair audit: eligible for both, not exposed to either | Built | `requestAssignment` (pair branch) |
| A different level for one session of a folder | Not built | level is set per submission and applies to all its views; set the stricter one |
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

| Item | Status | Where |
| --- | --- | --- |
| Four categories, participant-facing summary | Built | How it works |
| Up to three authored entries; a piece and its related versions count once | Built | `lib/episodes.ts` (`setPrizeEntry`) |
| Entries can be closed by hand or at a set time | Built | Organize → Prize entries |
| Amounts, deadlines, weights, tie rules | Yours to announce | the page says the organizers will announce them |
| Scoring by a separate panel, random sample of five reviews | Not built | judging happens outside the platform, from the export |

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
5. prizes page and the How it works text
6. organizer console and export
7. tests and documents

`git log --oneline main..claude/biosecurity-transcript-platform-tgu67r`
lists them, and `git show <commit>` shows one. A pull request from the
branch into `main` gives the same thing in the browser, commit by commit.
