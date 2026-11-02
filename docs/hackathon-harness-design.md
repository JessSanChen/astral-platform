# Hackathon harness: system design

Status: draft v1 (2026-11-02). Companion to `hackathon-harness-mvp.md`, which says *what*; this
says *how*. Sized for one builder over three weeks, one VM, one event day, ~50 participants.

## 1. Principles

1. **Capture first.** A user turn is durable before the model is called; an assistant turn is
   durable before the browser sees the last token. Everything else can fail.
2. **Encrypt by construction.** Transcript text never touches a table in the clear. The
   encryption layer is the first thing written, so no code path can forget it.
3. **One binary, one database.** FastAPI app plus one worker process from the same codebase,
   Postgres, a reverse proxy. No Redis, no queue broker. A `jobs` table does the queueing.
4. **Content-free by default.** Logs, events, dashboards and error reports carry ids and
   counts, never text. Content reads are explicit admin actions and are logged.
5. **Boring choices.** Python/FastAPI (the team's language, and ASTRAL's stages are Python),
   Postgres, React + Vite + TypeScript SPA, Caddy for TLS. Nothing that needs its own ops.

## 2. Components

```
browser (SPA) ──HTTPS──> Caddy ──> api (FastAPI, uvicorn)
                                      │        │
                                      │        └──> OpenRouter (ZDR account)  [chat, judge]
                                      ▼
                                   Postgres  <──  worker (same image: jobs loop, sweeper, judge, screen)
                                      ▲
                               cron: pg_dump → encrypted snapshot → object storage (hourly on event day)
```

| Component | Responsibility |
|---|---|
| `api` | Auth, participant and admin endpoints, SSE streaming, redaction, export. Stateless. |
| `worker` | Polls `jobs`: proxy judge (Tier 2), evening screen (Tier 2), stuck-stream sweeper, snapshot trigger. One process, `SELECT … FOR UPDATE SKIP LOCKED`. |
| `gateway` (module) | The only code that talks to a model provider. Decrypts the key, enforces caps, streams, records usage. |
| `crypto` (module) | Envelope encryption for transcript text and the provider key. |
| `events` (module) | Append-only event log; every endpoint that changes state or reads content calls it. |
| SPA | Three surfaces: participant (sessions, chat + workshop pane, submit, withdraw), admin, link landing. |

## 3. Data model

Postgres, UUID keys, `created_at` everywhere. Text columns that hold transcript content are
`bytea` ciphertext; there is deliberately no plaintext `content` column anywhere.

```
event_config        singleton: name, event_day_start, event_day_end, withdraw_until,
                    paused_tracks text[], caps (tokens per session / participant), judge_model_id

participants        id, handle, track (A|B|C), grid_cell jsonb, table_no, status (active|revoked),
                    notes (admin-only, content-free)
login_links         id, participant_id, token_hash, expires_at, used_at, issued_by, purpose (event|withdraw)
admins              id, username, password_hash, created_at, disabled_at

models              id, label (what participants see), provider_model_id, tracks text[], enabled,
                    default_params jsonb, price_in_per_m, price_out_per_m
provider_keys       id, provider, key_ciphertext, key_version, set_at, set_by

sessions            id, participant_id, kind (primary|workshop), linked_session_id, model_id,
                    track (copied at create), status (open|submitted|quarantined|withdrawn),
                    title, wrapped_key bytea, created_at, submitted_at, last_turn_at
turns               id, session_id, idx, role (user|assistant|system), author (participant|model|admin),
                    status (streaming|complete|error|interrupted), content_ct bytea, redacted_ct bytea,
                    provenance (typed|pasted|edited|null), provenance_confirmed bool,
                    client_turn_id (unique per session), model_id, tokens_in, tokens_out,
                    finish_reason, error_code, created_at, completed_at
submissions         session_id (pk), self_report jsonb {goal, prior_knowledge, real_or_persona},
                    grid_cell jsonb, attested bool, redactions jsonb, proxy_scores jsonb, judged_at
flags               id, session_id, raised_by (participant|screen|admin), reason_code, created_at
events              id, ts, actor_type (participant|admin|system), actor_id, action,
                    participant_id, session_id, meta jsonb        -- append-only, content-free
jobs                id, kind, payload jsonb, status, attempts, run_after, locked_at, error
```

Notes:

- `turns.author` is what the HI platform lacked: it distinguishes a participant's turn from an
  admin's or a system message. Admin cannot post into a participant session in this design; the
  column exists so that is a check, not an assumption.
- `redactions` records every highlight with source (`regex|ner|manual`), span, replacement and
  whether the participant accepted it. `redacted_ct` is the post-redaction text per turn.
- `proxy_scores` is Tier 2; the column costs nothing now.
- Usage caps are not stored; they are `SUM(tokens)` over `turns` per session and per
  participant, checked in the gateway before each call. Indexed on `session_id` and via
  `sessions.participant_id`.

## 4. Encryption

Envelope scheme, standard library plus `cryptography`:

- **Event master key** `EMK`: 32 random bytes in the VM's env file (a KMS later). Never in the
  database, never in logs.
- **Per-session data key** `SK`: generated at session create, AES-256-GCM. Stored in
  `sessions.wrapped_key` as `AESGCM(EMK).encrypt(SK)`.
- **Turn text**: `AESGCM(SK).encrypt(nonce, plaintext, aad=turn_id)`. Nonce prefixed to the
  ciphertext. Same for `redacted_ct`.
- **Provider key**: `AESGCM(EMK).encrypt(key)`, with a version so rotation is append-then-switch.

Consequences this buys:

- **Withdraw** = delete the session rows *and* its `wrapped_key`. Even a snapshot taken before
  the delete holds only ciphertext under a key that no longer exists anywhere.
- **Day-30 destruction** = delete `EMK` and the VM. Snapshots in object storage become noise.
- **Export** decrypts in memory with `EMK` and writes plaintext only to the export file, which
  is itself produced into an encrypted location.
- A DB dump leak without `EMK` reveals structure, counts and timings, not text.

What it does not buy: an attacker with root on the running VM has `EMK`. The disk encryption,
firewall and small admin set are the controls for that, not the app.

## 5. Authentication and sessions

**Participants.** Admin creates a participant (or uploads a CSV of `handle, track, cell, table`).
The server mints a 32-byte random token per participant, stores `sha256(token)` in
`login_links` with `expires_at = event_day_end`, and offers a CSV download of `handle, url`.
Colby mail-merges from the registration sheet; the harness never sees an e-mail. Clicking the
link once sets an HttpOnly, Secure, SameSite=Lax cookie carrying a signed session (participant
id, expiry = `event_day_end`). The link is single-use; "reissue" invalidates all prior links
and cookies for that participant. A second link type, `purpose = withdraw`, is minted after the
event with `expires_at = withdraw_until` and grants a read-only mode: list own sessions,
withdraw. Admins can also mint one on request if a participant lost theirs.

**Admins.** Username and password (argon2), HttpOnly cookie, 12-hour expiry, created by Jessica
from a CLI command on the VM. Three to five accounts. TOTP is a later addition; the mitigation
now is the small set, strong passwords and the event log.

**Authorization.** Two dependency functions, `current_participant` and `current_admin`. Every
participant query is scoped by `participant_id` from the cookie; there is no endpoint that
takes another participant's id. Admin endpoints live under `/admin/*`. Invisible things 404.

## 6. The message path

`POST /sessions/{id}/turns` with `{content, client_turn_id}`, response is SSE.

1. Load the session for the cookie's participant, `FOR UPDATE`. 404 if not theirs, 409 if not
   `open`, 423 if the track is paused.
2. Caps: sum tokens for session and participant; refuse with a clear error if over.
3. Idempotency: if `client_turn_id` already exists, replay the stored assistant turn as SSE and
   stop. Participants double-click.
4. Provenance candidate (primary sessions only): compare `content` with the last 10 assistant
   turns of the linked workshop session (decrypted in memory). Any shared window of ≥40
   characters → `pasted` if the shared text is ≥80% of the turn, else `edited`. Store on the
   user turn as a candidate; the participant confirms at submit.
5. **Transaction A**: insert the user turn (`complete`) and an assistant turn (`streaming`,
   empty), commit. From here the turn exists whatever happens.
6. Gateway: decrypt provider key, build messages from the session's turns (decrypted in
   memory, user and assistant only, no system prompt unless the model row defines one), call
   OpenRouter with `stream: true`, `stream_options.include_usage`.
7. Forward each delta as `event: delta`. Buffer text.
8. **Transaction B** on stream end, in a `finally` and shielded from client disconnect: encrypt
   buffer, set `complete` with usage and finish reason, or `error` with a code, or
   `interrupted` if the client went away. Emit `event: done` or `event: error`.
9. Event log: `turn.sent` with session id and turn index, nothing else.

The worker's sweeper flips any `streaming` turn older than 10 minutes to `interrupted`.

The workshop pane uses the same endpoint against the linked `kind = workshop` session. Nothing
else distinguishes it except the `kind`, so it is logged identically.

## 7. Redact and submit

`POST /sessions/{id}/redaction-preview` runs the detectors over all user *and* assistant turns
and returns candidate spans:

- regex: e-mail, phone, URL, long alphanumeric identifiers (accession-like strings, order
  numbers), IP addresses;
- NER: spaCy `en_core_web_md` loaded once in the api process, `PERSON` and `ORG` entities, with
  a small allowlist for common organisms and reagents that NER mislabels as ORG.

The SPA shows each candidate with accept / edit / dismiss. `POST /sessions/{id}/submit` takes
the final redaction list, the three self-report fields, the grid cell, the attestation and the
provenance confirmations. The server applies the redactions, stores `redacted_ct` per turn,
writes `submissions`, moves the session to `submitted`, and for Track B or C enqueues a
`proxy_judge` job. Submitted sessions are read-only to the participant. Nothing leaves the VM
during this step; NER is local.

## 8. Admin console

All under `/admin`, all logged. Screens:

- **Participants**: table with handle, track, cell, table, status, sessions, submissions, tokens.
  Actions: create one, upload CSV, download links CSV, reissue link, change track or cell,
  revoke.
- **Sessions**: list with filters (participant, track, status, flagged). Actions: quarantine,
  un-quarantine, **view content** (a separate click with a reason field; logged as
  `content.read`).
- **Models**: label, provider id, tracks, enabled, params, prices. Add, edit, disable.
- **Provider key**: shows `set / not set`, version, set-by, set-at; a write-only field to replace.
- **Event**: pause or resume a track, edit caps, open or close the withdraw window.
- **Dashboard**: live counts (sessions, submissions, turns) by track, model and table; grid-cell
  coverage matrix; tokens and estimated spend per participant and total; flags and quarantines;
  gateway error rate over the last 15 minutes. Plain SQL aggregates, refreshed every 30 s.
- **Events**: searchable event log.
- **Export**: choose scope (accepted only, or everything for hazard review), confirm, download.

## 9. Export

A JSONL file, one object per session, plus `manifest.json` with the event config snapshot,
counts and a SHA-256 per output file. Per session: participant pseudonym, track, grid cell,
model label and provider id, self-report, provenance flags per turn, redaction list, and the
turns in redacted form (or raw when the scope is the hazard-review export). The exact field
names should match ASTRAL's existing upload format; that format is still needed (open item).
Workshop sessions are exported alongside their primary with the link preserved.

## 10. Deployment

One VM in an ASTRAL-controlled cloud account, encrypted disk, ports 80/443 only, SSH by key
from named IPs. `docker compose` with four services: `caddy` (automatic TLS), `api`, `worker`,
`postgres` (volume on the encrypted disk). Secrets in an env file readable by root only.
Hourly on event day, then daily: `pg_dump | age -r <ops key> > snapshot` to object storage.
Day 30: destroy the VM and object-storage prefix, delete `EMK`, log it.

Observability is logs to stdout with request ids, shipped nowhere; the dashboard is the
monitor on the day. An uptime ping from a phone is enough for one Saturday.

## 11. Testing and the dry run

- Unit: crypto round trips, provenance classifier, redaction detectors, caps arithmetic.
- API: pytest against a throwaway Postgres (testcontainers), the fake OpenAI-compatible server
  from `tools/hi-eval/fake_openai.py` standing in for OpenRouter. Cover the message path's
  three terminal states, idempotent replay, participant isolation (every endpoint with another
  participant's id → 404), paused track, caps.
- Load: 60 simulated participants streaming concurrently against the fake server for 20
  minutes on the real VM. Watch connection count and p95 time-to-first-token.
- Dry run (week 4): five team members, real OpenRouter, every screen, a withdrawal and an
  export. This is the Tier 1 acceptance gate.

## 12. Build order

Three weeks, in dependency order. Each week ends with something a non-builder can click.

| Week | Build | Done when |
|---|---|---|
| 1 | Repo scaffold, schema and migrations, `crypto`, `events`, participant links and cookies, gateway with streaming, minimal chat screen | One participant logs in by link, chats with a real model, refreshes the page, and the sealed turns are all there |
| 2 | Workshop pane and provenance, redaction preview and submit, admin: participants, links CSV, models, provider key, pause track, dashboard v1, caps | Track A works end to end for a test participant; a helper can provision someone and reissue a link without asking Jessica |
| 3 | Withdraw links and hard withdraw, export with manifest, quarantine and content view with logging, sweeper, compose deployment on the VM, snapshots, load test | Dry-run ready |
| 4 | Dry run, fixes, then Tier 2: `proxy_judge` job and score display, evening screen job | Prize decision can be made from the admin console |

## 13. Open items

1. ASTRAL's existing upload JSONL format, for section 9.
2. Judge model and prompt owner for Tier 2 (Colby diffs it against the private rubric).
3. Price table per model for the spend estimate, or accept token counts only.
4. Whether `en_core_web_md` is good enough for names in a bio context, or whether a
   scientific NER model is warranted. Test on the dry-run data.
5. Confirm with CBAI whether the attestation text needs institutional wording.
