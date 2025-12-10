# PRD: Web Frontend for nd-import

## Background
Navidrome admins currently run `nd-import` via CLI to pull Pixeldrain zips into the Navidrome library. This PRD defines a minimal web experience that wraps the CLI with a backend API and a small React UI so admins can submit imports with two fields and see progress/results without terminal access.

## Problem Statement
- Importing requires shell access and comfort with CLI flags.
- No easy way to observe download progress, stage transitions, or errors remotely.
- Manual runs risk path collisions or incomplete cleanup without clear feedback.

## Goals
- Allow an authenticated user to submit `artist` + `Pixeldrain URL/ID` from the browser and trigger `nd-import` on the Navidrome host.
- Surface live progress (bytes for download, stage markers for the rest) and final success/failure with key stats (download size, extracted entries, pruned count, moved files).
- Keep operational setup simple: single host, uses existing env/config expected by `nd-import`.

## Non-Goals (initial release)
- Persistent queue storage or multi-user auth flows.
- Editing Navidrome metadata beyond file placement.
- Rich error remediation (manual file cleanup automation).
- UI for advanced flags beyond hidden/experimental `dry-run` and `keep-temp`.

## Users & Use Cases
- **Navidrome admin/operator**: wants to import an album from Pixeldrain without SSH; needs visibility into download progress and collisions; expects a concise log of what happened.

Primary flows:
1) Submit artist + Pixeldrain link → watch download progress → see completion summary.
2) Submit invalid/duplicate path → receive clear failure reason (e.g., collision) and log snippet.
3) Optional: run `dry-run` for verification (behind a toggle/flag).

## Functional Requirements
- Input form validates required `artist` and `url` before submission; rejects empty or obviously invalid Pixeldrain values.
- Backend endpoint accepts `{artist, url}` (and optional flags later), sets required env (`NAVIDROME_MUSIC_PATH`, optional `UNNEEDED_FILES`, `PIXELDRAIN_TOKEN`), and invokes `nd-import`.
- Live progress stream:
  - Download stage shows bytes/percent/speed/ETA parsed from the CLI progress line.
  - Stage transitions derived from CLI log markers: Pending → Downloading → Extracting → Pruning → Checking collisions → Moving → Cleaning up → Done/Failed.
  - Final payload includes exit code, stats (download bytes, extracted entries, pruned count, moved files), and trimmed logs/errors.
- Job list UI shows each submission with current status, progress bar when downloading, start/end timestamps, and final result.
- Single-host safety: prevent concurrent conflicting runs if they target the same artist path or enforce a single-worker queue.

## Success Metrics
- Time-to-import: submission to Done under expected network speed (baseline to be measured; success if no extra overhead vs CLI).
- Progress fidelity: download percent matches CLI within 5% and stage order matches observed CLI logs.
- Usability: zero terminal steps required for a happy-path import.
- Reliability: failed imports return actionable error text and leave Navidrome path unchanged.

## UX Notes
- Minimal React UI with two text inputs and a submit button; job list beneath.
- Download stage shows a progress bar with percent/ETA; other stages show textual status.
- Error states surface stderr snippets and a concise explanation (e.g., collision detected at `<path>`).

## Dependencies
- `nd-import` binary available on the host, Go runtime if using `go run`.
- Env: `NAVIDROME_MUSIC_PATH` required; optional `UNNEEDED_FILES`, `PIXELDRAIN_TOKEN`; `.env` support.
- Network access from host to Pixeldrain.

## Risks & Mitigations
- **Log format drift**: write parsers against stable markers and unit-test fixtures.
- **Long-running downloads**: use SSE with keep-alives and server timeouts tuned high; allow reconnection to resume viewing.
- **Collisions/cleanup issues**: rely on CLI safeguards and surface clear failure reasons; avoid partial moves by honoring CLI checks.
- **Queue durability**: in-memory store loses state on restart; document this and keep scope small for v1.

## Release Plan
- v1 (this PRD): single-host backend wrapper, in-memory job tracking, SSE/streaming to frontend, minimal UI.
- Future: persistence layer for jobs, auth, multi-worker scheduling, UI for advanced flags, richer log/search.
