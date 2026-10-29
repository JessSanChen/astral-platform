# Evaluation: Humane Intelligence `hi-oss-ai-red-teaming` as the ASTRAL hackathon harness

Status: draft for discussion (2026-10-29). Everything here is open to revision. The
"MVP contract" in section 2 is **derived** from the hackathon proposal and the reframe doc;
no written contract existed before this note, so treat section 2 as the first draft of one.

## 0. Verdict in one paragraph

The platform does the core thing we need, and does it well: a red-teamer logs in, talks to a
model whose API key they never see, every turn is persisted with usage, flags/reviews/notes
attach to messages, and owners export CSV/JSON. Its access control is careful and held up under
every negative probe I ran. It does **not** meet the hackathon's MVP contract as written. The
gaps that matter are per-message author provenance (an admin can write into a participant's
transcript indistinguishably), hard deletion for the withdrawal window (soft-delete with a
7-day restore window only), a redaction/submit step, pseudonymous identity (exports carry
e-mails), the "workshop panel" second session, and any hook for our scanner. Some of those are
small additions; two (provenance, hard delete) touch the data model. My recommendation is to
adopt it as the harness **if** we accept a fork with roughly four focused changes (section 6),
and to make that decision after the owners' Decisions list in section 7.

## 1. What was inspected and run

| Item | Value |
|---|---|
| Repo | https://github.com/humane-intelligence/hi-oss-ai-red-teaming |
| Pinned commit | `01d2ef5d22d12b3bc2f1f99a8d1ebe14daeedff1` (2026-10-22, "Validate the model id on save…", PR #21) |
| Only release tag | `v0.1.0` (2026-09-10). HEAD adds the OIDC e-mail-domain allowlist, a web-access switch, and CVE bumps, so pin the SHA, not the tag. |
| Licence | Apache-2.0 code, CC-BY-4.0 docs, DCO sign-off required |
| Contributors | 3 humans plus dependabot; 18 commits total |
| Stack | Python 3.14 / FastAPI / SQLModel / Celery / Postgres 18 / Redis / litellm; React 19 + Vite console |
| Size | ~52k lines backend app, ~73k lines backend tests, ~93k lines frontend, 40 tables |

How I ran it (no Docker daemon in this sandbox, so native instead of `make dev`):

1. `uv sync --locked --all-groups` in `backend/` (uv fetched CPython 3.14.6).
2. Local Postgres 16 and Redis; `.env` from `.env.example` with hosts set to `localhost`.
3. `alembic upgrade head` (79 migrations applied clean on PG16, compose targets PG18),
   then `python -m scripts.seed_local` (one login per role, demo group/eval/scenario/task).
4. `uvicorn app.main:app` plus one Celery worker (exports run in the worker).
5. A 60-line fake OpenAI-compatible server (`tools/hi-eval/fake_openai.py`) on
   `127.0.0.1:8081`, registered as a `generic` provider model. This is the "synthetic data":
   deterministic replies, streaming and non-streaming, logs every request it receives.
6. `tools/hi-eval/drive.py` and `drive2.py` drive the workflow below over HTTP.

The frontend was not run (needs a Node build; secondary to the API contract).

### 1.1 The smallest synthetic workflow, as executed

| Step | Actor | Call | Result |
|---|---|---|---|
| Register model | admin | `POST /ai-models` (provider `generic`, endpoint = fake server, api_key) | 201; key stored as JWE (`dir`+A256GCM), a health probe fired (`max_tokens: 1`) and marked it `alive` |
| Allow model in group, assign to evaluation | admin | `PATCH /evaluation-groups/{id}`, `POST /evaluations/{id}/models` | 201 |
| Open conversation | red-teamer | `POST /scenarios/{id}/conversation-groups` (1 model entry) | 201, one conversation created |
| Turn 1 with tags | red-teamer | `POST …/conversations/{id}/messages` (SSE) | 200; 21 `delta` + 1 `done` with usage; tags folded into a system message the fake server saw |
| Turn 2 | red-teamer | same | history replayed as `user, assistant, user` |
| Idempotent replay | red-teamer | same `client_message_id` | 200; one `delta` + `done{finish_reason: replayed}`, no model call |
| Flag the reply | red-teamer | `POST /message-flags` | 201 |
| Review | annotator | `GET /review-queue`, `POST /reviews` (self-assign), `PATCH /reviews/{id}` status `approved` | 200/201/200 |
| Annotate, note | annotator | `POST /annotations`, `POST /notes` | 201 |
| Export | owner | `POST /exports/jobs` for transcript, conversations, flags, reviews (csv and json) | 202 then `ready`; download 200 |
| Metrics, audit | owner, admin | `GET /evaluation-groups/{id}/metrics`, `GET /audit-logs` | 200 |
| Sealed group | owner | group under the "No license" entry (or a custom licence with `protects_conversation_data`) | message rows stored as `92:v2:<ciphertext>` with `content_encrypted = t`; API still returns plaintext to authorised readers |
| Withdraw | red-teamer | `DELETE …/conversations/{id}` | 204 soft delete; owner can list with `?deleted=true`; admin break-glass read now 404 |

## 2. Derived MVP contract (draft)

Sources: hackathon proposal sections "Event design", "Use of AI tools", "Biorisk and safety",
"Data collection, retention and security"; reframe doc section 11. Items are phrased as
testable requirements. "Must" = the event cannot run without it.

| # | Requirement | Source | Verdict |
|---|---|---|---|
| C1 | Participants never hold provider keys; all model calls go through one harness account | hackathon §Data collection | **Met.** Key encrypted at rest, decrypted only in dispatch, never returned by the API |
| C2 | Every turn persisted with timestamps and token usage; transcript exportable as JSONL/CSV | hackathon §Retention day 14 | **Met** (JSON array rather than JSONL; trivial) |
| C3 | Per-participant isolation: a participant sees only their own sessions; no cross-user read, no bulk export for participants | hackathon §Hazard controls | **Met.** Probed: viewer 403 on create/send/stream, annotator 403 on transcript, second red-teamer cannot see first's rows, red-teamer 403 on export and audit |
| C4 | Author provenance per message: who typed each user turn, and whether anyone other than the owner wrote into the session | hackathon §Use of AI tools (typed / pasted / edited flag) | **Not met.** `messages` has no author column. Admin break-glass `POST …/messages` into a red-teamer's conversation succeeded (200) and the row is indistinguishable from the participant's own. Message sends are not audited (no `message.*` audit action); only transcript *reads* and exports are |
| C5 | Content-free event log (session created, turn count, flags, submit, withdraw) for audit | hackathon §Storage | **Partly.** Append-only `audit_logs` exists with 90 action types covering flags, reviews, exports, logins, reads. Missing: message send, conversation create/delete |
| C6 | Encrypted quarantine of raw transcripts until hazard review | hackathon §Data collection | **Met with configuration.** Choose a licence with `protects_conversation_data` for the event group; messages sealed under a separate `CONVERSATION_SECRETS_KEY` with rotation sweep. Default licence (CC-BY-4.0) stores plaintext, so this is an operator step, not a default |
| C7 | Withdrawal window: participant removes a session and it is **hard-deleted** from DB and snapshots | hackathon §Retention days 0-3 | **Not met.** Soft delete only; `RESTORE_WINDOW_DAYS=7`; "nothing purges a tombstone past the window" (config comment). Rows remain readable by direct DB access |
| C8 | Redaction-before-submit step (regex + local NER, participant confirms, attestation) | hackathon §Redaction | **Not met.** No redaction, no submit state, no attestation. Nearest hooks: message `tags`, `task_completions`, the terms/consent gate |
| C9 | Pseudonymous identity in the harness DB and exports | hackathon §Storage | **Not met.** Users are e-mail accounts; exports carry `Owner email`, `Author email`, `Reviewer email` |
| C10 | Magic-link auth, tokens expiring at 18:00 on the day | hackathon §Harness | **Partly.** Invitation tokens (TTL 168h) create accounts; sessions are JWT (24h) + refresh (30d). Password or Google OIDC with an e-mail-domain allowlist; `invite_only` platform flag. No magic link, no hard cut-off, but force-logout (single and bulk) exists |
| C11 | Terms/consent recorded per participant | hackathon §Institutional review | **Met.** Versioned terms documents; acceptance enforced on every authenticated route |
| C12 | Track assignment and coverage grid per participant/session | hackathon §Tracks | **Partly.** Scenario/task hierarchy and free-form conversation and message `tags` (folded into the system prompt unless the evaluation disables tagging). No per-participant assignment or live tally |
| C13 | Workshop panel: a second logged model session linked to the primary transcript | hackathon §Use of AI tools | **Not met.** Stateless `POST /chat/stream` exists but persists nothing. Conversation groups (several conversations sharing a scenario) are the nearest structure |
| C14 | Live first-pass scanner feedback for Track C; no scanner exposure for Track B | hackathon §Gamification | **Not met.** No hook for an external classifier on message finalize. `persist_stream` Transaction B is the natural place |
| C15 | Hazard review queue with accept / redact-model-turn / reject-and-destroy and content-free codes | hackathon §Review protocol | **Partly.** Flags → review queue → verdict (`approved`/`rejected`, `successful_exploit`, `unique_exploit`, `valid_submission`, notes) with a `required_reviews` threshold per scenario. No redaction of model turns, no destroy, verdicts are red-team oriented |
| C16 | Per-session and per-participant spend caps | hackathon §Harness | **Not met.** Usage is recorded per message and aggregated in metrics; nothing enforces a cap |
| C17 | ZDR routing (OpenRouter account setting) | hackathon §Harness | **Met by configuration.** `generic` provider takes any OpenAI-compatible base URL; routing policy is the account's, not the harness's |
| C18 | 2-3 frontier models per track, model identity hidden from participants | hackathon §Harness | **Met.** `mask_models_enabled` per evaluation; masking also hides provider and model id from the admin's assignment listing (I had to match by display mask) |

Score: 7 met or met-by-configuration, 4 partly, 7 not met. The not-met set is what a fork
would have to add.

## 3. Message path (write side)

`POST /api/v1/evaluations/{eid}/conversations/{cid}/messages` (`backend/app/api/v1/messages.py`):

1. Gate: `conversations:update` held globally **or** via an in-group role on the parent
   evaluation group (`require_conversation_permission`).
2. `get_conversation(..., for_update=True)` resolves the row under the owner predicate plus
   group visibility, locks it. Admin `evaluation_groups:manage` lifts both predicates.
3. Transaction A: `open_turn` inserts the user message and an assistant placeholder with
   status `streaming`; `client_message_id` is unique, so a repeat replays instead of
   re-generating. Commit, so the detached finalize can see the placeholder.
4. `_stream_into`: resolve model alias and parameter cascade (model → assignment →
   conversation → per-request override); fold allowed tags into a system suffix (out of band
   from params, so a model with advanced params disabled still gets them); build history;
   `dispatch_stream` decrypts the key and opens the litellm stream; close the request DB
   connection.
5. `persist_stream` forwards `delta`/`done`/`error` SSE events while buffering; in `finally`
   (shielded) Transaction B seals the text if the conversation is `content_protected` and
   finalizes the placeholder to `complete`, `error`, or `interrupted`. Usage, finish reason and
   the tag map land in `extra`.
6. A Celery beat task reaps placeholders stuck in `streaming` past 15 minutes to
   `interrupted`.

The stateless sibling `POST /api/v1/chat/stream` gates on `conversations:participate`, resolves
no conversation, persists nothing.

What is **not** on this path: any author id on the message, any audit row, any post-finalize
hook.

## 4. Permission path

Two layers, both verified by probes:

- **Global roles in the JWT** (`permissions` claim, minted at login): `admin`, `owner`,
  `red_teamer`, `annotator`, `viewer`. The full matrix is `backend/docs/permissions.md`.
  Red-teamer holds `conversations:{create,read,update,delete,participate}`, `flags:*`,
  `notes:*`, `reviews:read`. Viewer holds reads on evaluations only.
- **Object roles per evaluation group** (`object_role_assignments`): the same role names
  assigned on one group. Once a user holds any role on a group, those permissions are their
  *entire* authority there; a global permission grants nothing at object scope. Break-glass
  `evaluation_groups:manage` (admin) passes every object check. In-group `owner` is protected
  (last holder cannot be removed).
- **Visibility** is a third filter: `public` (non-draft), same live organization, or member.
  Invisible objects return 404, not 403.
- **Consent gate** runs inside `current_user` on every authenticated route.
- **Group lifecycle**: `draft → pending_approval → approved → published → inactive`. Owner
  creates and submits, admin approves, owner publishes. Evaluations can be added only to an
  approved or published group.

Probe results (all as expected except one wrong expectation of mine):

| Probe | Status |
|---|---|
| viewer creates conversation group / sends message / uses `/chat/stream` | 403 / 403 / 403 |
| annotator reads a red-teamer's transcript directly / creates a flag | 403 / 403 |
| red-teamer lists models / reads audit log / records a verdict / requests export | 403 / 403 / 403 / 403 |
| red-teamer reads reviews of own flag / uses `/chat/stream` | 200 / 200 |
| in-group owner reads member transcript (`conversations:read_any`) / writes into it | 200 / 403 |
| admin reads member transcript / **writes into it** | 200 / **200** |
| admin reads a soft-deleted conversation | 404 |

## 5. Other observations worth keeping

- Audit trail is append-only and useful: logins (attempt-level, no e-mail), group lifecycle,
  model assignment, flag/review/note/annotation writes, export create/ready/download, and
  `data.read` on transcript and submission reads. Credential access is audited.
- Exports are generated in the worker, stored locally or on S3, expire after 24h, and the
  download is audited. Templates: transcript, conversations, conversation groups, flags,
  reviews, engagement report.
- Metrics endpoint gives member counts, submissions by status, review outcomes, tokens by
  model; per-member scope is configurable per group.
- The two assignments listed for an evaluation showed `provider: null, provider_model_id: null`
  to the admin because the evaluation masks models. Fine for participants; surprising for
  operators.
- Running without Docker works but is off the documented path. The repo's own `make` targets
  for migrate/seed shell into compose.
- Review verdict enum is `pending | approved | rejected`; the first run's 422 was my payload.

## 6. If we fork: the minimal change set

Ordered by how much of the contract each unlocks.

1. **Message author + send audit** (C4, C5): add `created_by_id` to `messages` (or to
   `turns`), stamp it in `open_turn`, emit a `message.create` audit action. Small migration,
   one service touch, one audit enum entry. Also decide whether break-glass should be allowed
   to *write* into member conversations at all; I would gate it off for the event.
2. **Hard delete for withdrawal** (C7): a `DELETE …?purge=true` owner-only path that removes
   turns/messages/flags for a conversation inside the window, plus a beat task that purges
   tombstones past the window. The sealing key already lets us do crypto-shredding instead if
   we rotate per event.
3. **Submit/redaction state** (C8, C12): a `submitted_at` on conversation, a redaction pass
   that writes a redacted copy and keeps the original sealed, and a required self-report
   (three free-text fields plus grid cell) using the existing `tags` or a small table.
4. **Post-finalize hook** (C14): call out to the ASTRAL keyword/embedding stages from
   Transaction B (or a Celery task on `complete`), store the result in `extra`, and expose it
   only for Track C evaluations.

Not worth building in the fork: pseudonymity (C9) can be handled by provisioning accounts
under opaque e-mails on our own domain and keeping the mapping offline, which the OIDC domain
allowlist and `invite_only` flag support; spend caps (C16) can be enforced at the OpenRouter
account; the workshop panel (C13) can be a second conversation in the same conversation group
with a tag, which is already logged.

## 7. Decisions needed

1. Fork and extend this platform, or build the thin harness the proposal describes (chat
   panel, workshop panel, redaction, submit)? The proposal budgeted 2-3 weeks of Jessica's
   time for the harness; the fork list above is plausibly 1-2 weeks but inherits a 125k-line
   codebase with a 3-person upstream.
2. Is admin write access into participant transcripts acceptable with audit, or must it be
   impossible? This decides whether change 1 is a column or a policy change.
3. Hard delete versus crypto-shredding for the withdrawal window.
4. Whether model masking should also hide identity from operators (it does today).

## 8. Reproduction

```bash
# from a checkout of the pinned commit, in backend/
uv sync --locked --all-groups
cp .env.example .env   # set DATABASE_HOST/REDIS_HOST/CELERY_BROKER_URL to localhost, OAUTH_COOKIE_SECURE=false
.venv/bin/alembic upgrade head
.venv/bin/python -m scripts.seed_local
.venv/bin/uvicorn app.main:app --port 8000 &
.venv/bin/celery -A app.workers.celery_app worker --concurrency=1 &
```

```bash
# from this repo
python -I tools/hi-eval/fake_openai.py &      # fake OpenAI-compatible model on :8081
python -I tools/hi-eval/drive.py              # workflow + permission probes, writes drive_log.json
python -I tools/hi-eval/drive2.py             # sealed-licence group, verdict, soft-delete withdrawal
```

Seeded logins are `admin@test.com`, `owner@test.com`, `redteamer@test.com`,
`annotator@test.com`, `viewer@test.com`, all with password `password123` (local only; the seed
refuses non-local environments).
