# Frontend Integration Notes (nd-import)

Purpose: expose the existing `nd-import` CLI as a backend service that a simple React UI can call with two fields: Artist name and Pixeldrain URL.

## What the backend already does
- Required inputs: `--artist <name>` and `--url <pixeldrain-url-or-id>`. Optional: `--tmp-dir`, `--keep-temp`, `--dry-run`.
- Environment: `NAVIDROME_MUSIC_PATH` (required absolute path), `UNNEEDED_FILES` globs for pruning, `PIXELDRAIN_TOKEN` optional for auth. Reads `.env` automatically.
- Workflow stages (good for status/progress mapping):
  1) Input/config validation and artist name sanitization.
  2) Pixeldrain ID resolution (accepts full URLs, doubledouble.top links, or bare IDs).
  3) Download zip (`https://pixeldrain.com/api/file/<id>?download`) with a streamed progress line; aborts on non-zip content-type or HTTP errors.
  4) Extract zip into temp, rejecting traversal/absolute paths.
  5) Prune extracted files via `UNNEEDED_FILES` (doublestar globs); aborts if patterns would delete everything.
  6) Collision check against `${NAVIDROME_MUSIC_PATH}/${artist}`; aborts if any file/dir already exists.
  7) Move/merge cleaned files into the artist folder.
  8) Cleanup temp download/extract dirs unless `--keep-temp` is set.
- Outputs/stats logged: download bytes, extracted entries count, pruned count, moved file count. Download step also prints a live single-line progress indicator.

## How to invoke it from a backend service
- Command form: `nd-import --artist "<Artist Name>" --url "<pixeldrain URL or ID>"` (positional args also supported).
- Needs to run on a host that can access Navidrome’s music path and has Go/built binary. For a web API, wrap this CLI in a server that:
  - Validates/passes through the two required fields.
  - Injects environment (`NAVIDROME_MUSIC_PATH`, optional `UNNEEDED_FILES`, `PIXELDRAIN_TOKEN`).
  - Streams stdout/stderr to the frontend (for progress/log display) and captures exit code for success/failure.

## Queue + progress considerations (future)
- Suggested per-job states derived from existing stages: `Pending -> Downloading -> Extracting -> Pruning -> Checking collisions -> Moving -> Cleaning up -> Done/Failed`.
- Download progress: already available via the CLI’s progress line (bytes, percent, speed, ETA). Tail stdout or parse the line to feed a UI progress bar.
- Other stages: no byte-level progress, but stage transitions can be signaled when matching log lines appear (e.g., “Extracted …”, “Pruned …”, “Import complete …”).
- Queue storage needs (outside current repo): list of jobs with {artist, url, status, progress?, log snippets, started/finished timestamps, temp paths if keeping}. Run jobs sequentially or with a small worker pool to avoid Navidrome path conflicts.

## UI data needs (for the simple React form)
- Inputs: `artist` (text), `url` (text). Optionally expose toggles for `dry-run` and `keep-temp` later.
- Display: job status list with current stage, download progress bar (when in Downloading), and final summary (download size, files moved/pruned). Include errors surfaced from stderr if a job fails (e.g., collision, invalid URL, bad env).
