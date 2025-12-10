# Navidrome nd-import helper

A minimal web app that wraps the existing `nd-import` CLI: an Express API that spawns the binary and streams progress via SSE, plus a React UI for submitting an artist + Pixeldrain URL and watching stages/download progress.

## Project layout
- `server/` – Express API wrapper, in-memory job queue, SSE streams, progress parsing, Node tests.
- `web/` – Vite + React UI (form, job list, live updates) with dev proxy to the API.
- `docs/` – plans/PRD/tasks provided by the project.
- `.env.example` – environment template (copy to `.env`).

## Prerequisites
- Node 18+ on the host.
- `nd-import` binary available on PATH (or set `ND_IMPORT_BIN` to an absolute path) and able to reach `NAVIDROME_MUSIC_PATH` (unless running with `MOCK_IMPORT=1`).

## Setup
```bash
# Backend
cd server
npm install

# Frontend
cd ../web
npm install
```

Copy `.env.example` to `.env` and fill in:
- `NAVIDROME_MUSIC_PATH` (required when not in mock mode).
- `ND_IMPORT_BIN` if the binary is not already on PATH (absolute path recommended).
- `PIXELDRAIN_TOKEN`, `UNNEEDED_FILES` as needed.
- `MOCK_IMPORT=1` to simulate jobs without touching Navidrome.

## Running locally
```bash
# Terminal 1: API (respects .env in repo root)
cd server
npm start

# Terminal 2: React dev server (proxies /api to :5000)
cd web
npm run dev
```
Visit the URL printed by Vite. Submissions create jobs; the UI auto-subscribes to each job’s SSE stream for live updates.

## Production build
```bash
# Build the React UI
cd web
npm run build

# Start the API (serves built assets from web/dist if present)
cd ../server
npm start
```

## API quick reference
- `POST /api/jobs` `{ artist, url, dryRun?, keepTemp? }` → `202` + job payload. Rejects missing `NAVIDROME_MUSIC_PATH` unless `MOCK_IMPORT=1`.
- `GET /api/jobs` → list of jobs (newest first).
- `GET /api/jobs/:id` → single job snapshot.
- `GET /api/jobs/:id/stream` → SSE with live updates/log snippets for that job.
- `GET /api/health` → simple status + env flags.

Jobs run sequentially to avoid Navidrome collisions; duplicate artists in Pending/Running are rejected.

## Testing
- Backend parser tests: `cd server && npm test`.
- Frontend: `npm run build` verifies the bundle.

## Notes
- Mock mode (`MOCK_IMPORT=1`) simulates the CLI so the UI can be exercised without Navidrome access.
- The API trims stored logs to the most recent 200 lines to keep memory bounded.
