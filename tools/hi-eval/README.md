# hi-eval

Scripts used to exercise Humane Intelligence's `hi-oss-ai-red-teaming` (pinned commit
`01d2ef5d`) for the evaluation in `docs/evaluations/hi-oss-ai-red-teaming.md`.

- `fake_openai.py` — deterministic OpenAI-compatible chat server on `127.0.0.1:8081`
  (streaming and non-streaming, `/v1/models`, `/health`, `/_log` of every request seen).
- `drive.py` — registers the fake model, runs a red-teamer conversation over SSE, flags,
  reviews, annotates, exports, reads audit logs, then runs permission probes under every
  seeded role. Writes `drive_log.json`.
- `drive2.py` — records a review verdict, creates a group under a content-protecting licence
  and shows messages sealed at rest, then soft-deletes a conversation.

Both drivers assume the HI backend on `127.0.0.1:8000` seeded with `scripts.seed_local`.
They depend on `httpx`, `fastapi`, `uvicorn` (all present in the HI backend's own venv).
