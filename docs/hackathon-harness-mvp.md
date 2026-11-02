# Hackathon harness: MVP scope

Status: draft v1 (2026-10-30), for Jessica to cut down. Derived from the hackathon proposal
("the brief") and the decision to build a custom harness rather than fork Humane Intelligence's
platform. Reviewer workflow is explicitly out of scope; hazard review happens offline on the
exported data.

## 1. What the harness is for

One hosted web app that ~50 invited people use for one day to produce 150-300 chat
transcripts, under conditions that make those transcripts usable as a test set: no provider
keys in participants' hands, every turn logged, participants isolated from each other, raw
data held in an encrypted quarantine until a human has reviewed it, and a clean export at the
end. Everything else in the brief (tracks, grid, proxy scores, prizes) exists to shape *what*
gets produced; it is secondary to capturing it correctly.

Two people operate it on the day: Jessica (technical) and the admin team (Colby plus
less-technical helpers) who need to fix logins, manage keys, pause a track, and watch totals
without touching code.

## 2. Roles

| Role | Who | Can |
|---|---|---|
| participant | ~50 invitees | Open and continue their own sessions, use the workshop panel, redact and submit, withdraw a session during the window. Sees nothing of anyone else. |
| admin | Jessica, Colby, helpers, the on-duty hazard reviewer | Provision and revoke participants, reissue login links, set track and grid cell, set or rotate the provider key, add or disable a model, pause a track, quarantine a session, see the aggregate dashboard, read session content, run the export. |

One admin role for now (decided 2026-11-02). Two consequences: every admin content read and
every export is written to the event log with who and which session, and the role check lives
in one place so splitting admin into operator / hazard reviewer / exporter later is a data
change, not a rewrite.

## 3. MVP by tier

**Tier 1: the event cannot run without it.** Build first; dry-run gate at week 4.

| # | Capability | Notes |
|---|---|---|
| M1 | Login by magic link | Harness mints a one-time link per pseudonymous id. Links distributed by Colby from the registration sheet, so the harness never stores an e-mail (see decision D1). Sessions expire 18:00 event day. Admin can reissue. |
| M2 | Pseudonymous participant record | `participant_id`, display handle, track, grid cell, table number, status (active/paused/revoked). No name, no e-mail. |
| M3 | Chat panel | Pick a model from the track's allowed list, send, stream reply, continue a session, start a new session. Multiple concurrent sessions per participant (Track B splits goals across 2-4). Model identity hidden behind a label. |
| M4 | Model gateway | One OpenRouter key held server-side, ZDR routing set at the account. Per-track model list. Per-session and per-participant token caps enforced before each call. Every call logged with model, tokens, latency, error. |
| M5 | Transcript store | Every user and assistant turn persisted immediately with timestamps, token usage, model label, and `author` (participant or system). Assistant turn stores finish reason and any error. Content encrypted at rest with a key separate from the DB credentials (crypto-shredding then satisfies day-30 destruction). |
| M6 | Workshop panel | A second chat session of type `workshop`, linked to the primary session. Same gateway, same logging. Participants told "prepare here, never type for you". |
| M7 | Turn provenance flag | Each primary user turn tagged `typed`, `pasted_from_workshop`, or `edited_from_workshop`. Automatic candidate from a substring/diff check against the last N workshop outputs, confirmed by one click at submit. |
| M8 | Redact and submit | Submit is a state transition. Automated pass highlights e-mails, phones, URLs, long identifiers (regex) and person/org names (local NER on the VM, no third-party API). Participant accepts or edits each highlight, fills three self-report fields and confirms the grid cell, and attests no unpublished results or third-party confidential material. Mandatory for Track A; same flow for B and C. Original and redacted text both kept, both sealed. |
| M9 | Stop-and-flag | A button on every session: "the model is producing something I think is dangerous". Freezes the session, marks it `quarantined`, notifies the hazard reviewer. |
| M10 | Admin console | Participant list with status, track, cell, session counts; reissue link; revoke; set track and cell; pause/unpause a track for the room; quarantine a session; model list with enable/disable; set/rotate provider key (write-only field, shows "set"/"unset" and last-changed). |
| M11 | Aggregate dashboard | Live: sessions and submissions per track, per model, per table; grid-cell coverage tally (the lunch rebalance input); tokens and estimated spend per participant and total; flagged and quarantined counts; error rate from the gateway. No content. |
| M12 | Event log | Append-only, content-free: participant created/revoked, link issued, login, session opened, turn count milestones, submit, withdraw, flag, quarantine, track pause, key set, export run, content read (who, which session). |
| M13 | Withdraw | Participant deletes any of their sessions via their link until the window closes (day 3). Hard delete of turns and derived rows, or crypto-shred by per-session key (D3). Event log keeps the fact of withdrawal only. |
| M14 | Export | Day-14 export of accepted, redacted sessions as JSONL in ASTRAL's existing upload format, with a manifest and per-file hashes. Export of *everything* (for the offline hazard review) is the same code path with a different filter and a louder confirmation. Admin only, with a confirmation step. |

**Tier 2: needed for Tracks B and C to work as designed.** Build after Tier 1 passes the dry
run; if time runs out, the event still runs with Track A plus unscored B.

| # | Capability | Notes |
|---|---|---|
| S1 | Proxy rubric judge | On submit of a B or C session, one LLM call over *user turns only* scoring persona consistency, progression, naturalness 0-3 each. Shown to the participant in near real time. Prompt text diffed against the private rubric before the event (Colby). |
| S2 | First-pass scanner feedback (Track C only) | On submit, run ASTRAL's keyword and embedding stages; store flagged/not flagged; show it to Track C participants as "stealth". Never run the LLM rubric stage or expose risk scores. Depends on the ASTRAL stages being callable from the VM (import or small HTTP service). |
| S3 | Leaderboards | B and C: per-participant proxy totals, revealed at wrap. A: coverage count by table, visible all day, no per-session score. |
| S4 | Automated evening screen | Batch job over all sessions: keyword + embedding stages plus a hazard-content classifier; flagged sessions routed to the reviewer view, rest put on a 72-hour hold. Output is a queue list, not a review UI. |

**Tier 3: nice to have, defer unless cheap.**

- Task cards and persona packets served inside the app (otherwise PDFs).
- Hourly encrypted snapshots to object storage (can be a cron on the VM, not app code).
- Lunch rebalance tooling beyond the tally (manual reassignment in M10 is enough).
- Any review UI (accept / redact model turns / reject). Done offline on the export.

## 4. Explicitly out

- Reviewer assignment, verdicts, review queue (the HI platform's centre of gravity).
- Organisations, per-object role matrices, custom roles.
- Multi-event lifecycle (draft / approve / publish). One event, one config file.
- Image input, notes, annotations, saved views, notifications, metrics access levels.
- Participant self-registration, password auth, OIDC.

## 5. Shape

Small enough that one person can hold it in their head. One FastAPI (or equivalent) service,
Postgres, one SPA with three screens (chat with workshop pane, submit, admin). Streaming over
SSE. Provider calls through one adapter so switching OpenRouter for direct keys is one file.
Content encryption and the event log are cross-cutting and go in first, not last, because
retrofitting them is how they get skipped.

Rough size: Tier 1 is on the order of 3-4k lines including the SPA. The HI platform's
equivalent subset is roughly ten times that because it carries engagements, reviews, licences
and exports as general machinery; we do not need the generality.

## 6. Decisions needed before building

| # | Decision | Default if nobody objects |
|---|---|---|
| D1 | How magic links reach people without the harness seeing e-mails | Harness generates links per pseudonym; admin downloads a CSV of `pseudonym, link`; Colby mail-merges from the registration sheet. Harness never sends mail. |
| D2 | One admin role or admin plus hazard reviewer | Decided: one role, content reads logged. Split later if needed. |
| D3 | Hard delete or crypto-shred for withdrawal and day-30 destruction | Per-session content key, deleted on withdrawal; event-wide key deleted on day 30. Avoids chasing snapshots. |
| D4 | Which models, and whether Anthropic is offered | Owner: Colby (the brief flags the standing rule about the private corpus). Harness supports any list. |
| D5 | Where ASTRAL's keyword and embedding stages run | Imported as a library on the same VM if the dependency footprint allows; otherwise a tiny internal HTTP service. Needed for S2 and S4 only. |
| D6 | Workshop paste detection threshold | Substring of ≥40 characters from any of the last 10 workshop outputs → `pasted`; participant can override at submit. |
| D7 | Is the submit step allowed to be skipped for Track B/C | No; same flow, but redaction highlights will mostly be empty. |

## 7. What the HI evaluation taught us that carries over

- Store the API key encrypted with a dedicated key; show only "set/unset" in the UI.
- Commit the user turn and an assistant placeholder *before* streaming, finalize after, and
  sweep placeholders stuck in streaming. Otherwise a browser refresh loses turns.
- Idempotent send on a client-generated message id. Participants will double-click.
- Make invisible things 404, not 403.
- Audit content reads and exports as events, not just writes.
- Mask model identity consistently; the HI console hid it even from admins, which was
  confusing. Admins should see real names, participants see labels.
