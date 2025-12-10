# Tasks: Frontend Integration for nd-import

- [x] Review `docs/plans/frontend-integration.md` to anchor requirements and CLI stages.
- [x] Draft integration plan and PRD (scope, goals, risks, success metrics).

## Upcoming Work
- [ ] Confirm runtime environment on target host (Go/binary availability, env vars, Navidrome music path access).
- [ ] Define API contract: request/response schema, job ID format, SSE event shapes, error envelope.
- [ ] Implement backend runner:
  - [ ] Input validation for `artist` and `url`.
  - [ ] Process spawning for `nd-import` with env injection and timeout handling.
  - [ ] Progress/stage parser for CLI stdout/stderr; normalize summary stats.
  - [ ] In-memory job registry with single-flight/queue to avoid collisions.
  - [ ] SSE/streaming endpoint for live updates; keep-alives for long downloads.
- [ ] Add backend tests:
  - [ ] Unit tests for progress/stage parsing with log fixtures.
  - [ ] Happy-path invocation test using `--dry-run` if available.
- [ ] Build frontend:
  - [ ] React form for artist + Pixeldrain URL.
  - [ ] Job list view with status, download progress bar, timestamps, and log/error snippets.
  - [ ] Error states and input validation messages.
- [ ] Manual/integration validation on target host:
  - [ ] End-to-end run against a small Pixeldrain sample.
  - [ ] Collision failure scenario to confirm UX.
- [ ] Documentation:
  - [ ] Runbook for setup (env, ports, how to build/run).
  - [ ] Notes on limitations (in-memory queue, log retention, auth assumptions).
