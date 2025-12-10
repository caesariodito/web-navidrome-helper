# Frontend Integration Plan (nd-import)

Goal: deliver a minimal but resilient web flow that lets a user submit an Artist name and Pixeldrain URL, have the backend run `nd-import`, and surface live progress plus final results/errors.

## Objectives
- Wrap the existing `nd-import` CLI in a small backend service callable from a React UI.
- Preserve current CLI behaviors (validation, pruning, collision checks) while exposing clear status to the UI.
- Stream meaningful progress (download bytes + stage changes) to the frontend for user feedback.
- Keep deployment simple and self-contained for the host that already runs Navidrome.

## Deliverables (phased)
1) **Backend API wrapper**: HTTP endpoint to trigger `nd-import` with `artist` and `url`, passing through required env vars; streams stdout/stderr/progress.
2) **Minimal frontend**: React form for artist + Pixeldrain URL; job list with status and download progress.
3) **Job tracking**: in-memory queue/state map for jobs with stages from the CLI logs; optional persistable adapter later.
4) **Operational docs**: how to run locally and on the Navidrome host, required env, and failure modes.

## Constraints & Assumptions
- Required inputs: `artist`, `url`; optional toggles (`dry-run`, `keep-temp`) stay hidden initially but should remain design-ready.
- Env must be injected: `NAVIDROME_MUSIC_PATH` (required), optional `UNNEEDED_FILES`, `PIXELDRAIN_TOKEN`; `.env` supported.
- Status stages derived from existing CLI logs: Pending → Downloading → Extracting → Pruning → Checking collisions → Moving → Cleaning up → Done/Failed.
- Download step emits byte progress; other stages are log-line based.
- Host already has Go/binary and file access to Navidrome music path.

## Approach
- **Backend service**: add a thin HTTP layer that validates inputs, spawns `nd-import`, and streams logs/progress to clients (SSE/websocket or chunked response). Capture exit code and summarize stats (download bytes, extracted entries, pruned count, moved files).
- **Progress parsing**: tail stdout for the download progress line; map other log markers to stage transitions; normalize errors for UI display.
- **Job model**: lightweight job registry keyed by ID with {artist, url, status, progress, log snippets, started/finished}. Start with in-memory storage and single-flight execution to avoid Navidrome collisions.
- **Frontend**: simple React UI with two fields and submit; show job rows with status, download bar when Downloading, and final summary/errors. Keep styling minimal but legible; avoid over-designed system.
- **Testing & validation**: unit test parsers for progress/stage detection; integration test an end-to-end run with `--dry-run` where possible; document manual verification for real imports.

## Risks / Open Questions
- Log parsing drift if CLI output changes; mitigate with test fixtures and stable markers.
- Long-running imports need resilient streaming; ensure timeouts/keepalives on SSE/websocket.
- Collision handling UX: make failures clear and recoverable without manual cleanup.
- Deployment target: confirm whether backend and Navidrome run on same host and how to expose the UI securely (auth/IP allowlist?).

## Decision checkpoints
- Choose transport for progress to UI: SSE preferred for simplicity; websocket if bidirectional control is needed later.
- Confirm whether to expose `dry-run`/`keep-temp` in the initial UI or hide behind a flag.
- Determine minimum job retention (how long to keep logs visible) and storage approach if in-memory is insufficient.
