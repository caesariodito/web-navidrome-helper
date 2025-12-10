import { useEffect, useMemo, useRef, useState } from 'react';
import './App.css';

const FINAL_STATUSES = new Set(['success', 'failed']);
const EMPTY_FORM = { artist: '', url: '', dryRun: false, keepTemp: false };

const mergeJob = (prevJobs, incoming) => {
  const existingIndex = prevJobs.findIndex((job) => job.id === incoming.id);
  if (existingIndex === -1) {
    return [incoming, ...prevJobs].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }
  const existing = prevJobs[existingIndex];
  const merged = {
    ...existing,
    ...incoming,
    progress: { ...(existing.progress ?? {}), ...(incoming.progress ?? {}) },
    stats: { ...(existing.stats ?? {}), ...(incoming.stats ?? {}) },
    logs: incoming.logs ?? existing.logs,
  };
  const next = [...prevJobs];
  next[existingIndex] = merged;
  return next;
};

const formatBytes = (value) => {
  if (value === undefined || value === null || Number.isNaN(value)) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let bytes = value;
  let unit = 0;
  while (bytes >= 1024 && unit < units.length - 1) {
    bytes /= 1024;
    unit += 1;
  }
  return `${bytes.toFixed(bytes >= 10 || bytes % 1 === 0 ? 0 : 1)} ${units[unit]}`;
};

const formatDate = (value) => {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat('en', {
      hour: 'numeric',
      minute: '2-digit',
      month: 'short',
      day: 'numeric',
    }).format(new Date(value));
  } catch {
    return value;
  }
};

const StatusPill = ({ status }) => {
  const label = status === 'success' ? 'Done' : status === 'failed' ? 'Failed' : status;
  return <span className={`status-pill status-${status}`}>{label}</span>;
};

const ProgressBar = ({ percent }) => {
  const clamped = Math.max(0, Math.min(percent ?? 0, 100));
  return (
    <div className="progress-shell">
      <div className="progress-fill" style={{ width: `${clamped}%` }} />
      <span className="progress-label">{Math.round(clamped)}%</span>
    </div>
  );
};

const JobCard = ({ job }) => {
  const lastLogs = useMemo(() => (job.logs ?? []).slice(-4), [job.logs]);
  const active = !FINAL_STATUSES.has(job.status);
  const percent = job.progress?.percent ?? (job.stage === 'Done' ? 100 : undefined);
  return (
    <article className={`job-card ${active ? 'job-card--active' : ''}`}>
      <header className="job-card__header">
        <div>
          <p className="eyebrow">Artist</p>
          <div className="job-title">{job.artist}</div>
          <div className="job-url">{job.url}</div>
        </div>
        <div className="job-meta">
          <StatusPill status={job.status} />
          <div className="stage">{job.stage}</div>
        </div>
      </header>

      {percent !== undefined && (
        <div className="row">
          <div className="label">Download</div>
          <ProgressBar percent={percent} />
        </div>
      )}

      <div className="row grid">
        <div>
          <p className="label">Started</p>
          <p className="value">{formatDate(job.startedAt ?? job.createdAt)}</p>
        </div>
        <div>
          <p className="label">Finished</p>
          <p className="value">{formatDate(job.finishedAt)}</p>
        </div>
        <div>
          <p className="label">Downloaded</p>
          <p className="value">{formatBytes(job.stats?.downloadedBytes ?? job.progress?.downloadedBytes)}</p>
        </div>
        <div>
          <p className="label">Extracted</p>
          <p className="value">{job.stats?.extractedEntries ?? '—'}</p>
        </div>
        <div>
          <p className="label">Pruned</p>
          <p className="value">{job.stats?.prunedCount ?? '—'}</p>
        </div>
        <div>
          <p className="label">Moved</p>
          <p className="value">{job.stats?.movedCount ?? '—'}</p>
        </div>
      </div>

      {job.error && (
        <div className="error-box">
          <div className="label">Error</div>
          <p>{job.error}</p>
        </div>
      )}

      {lastLogs.length > 0 && (
        <div className="logs">
          <div className="label">Latest log</div>
          <ul>
            {lastLogs.map((entry, idx) => (
              <li key={`${entry.timestamp}-${idx}`}>
                <span className="log-time">{formatDate(entry.timestamp)}</span>
                <span className="log-text">{entry.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
};

function App() {
  const [jobs, setJobs] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const streams = useRef(new Map());

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch('/api/jobs');
        if (!response.ok) throw new Error('Unable to load jobs');
        const data = await response.json();
        setJobs(data);
      } catch (err) {
        setError(err.message);
      }
    };
    load();
  }, []);

  useEffect(() => {
    jobs.forEach((job) => {
      const isFinal = FINAL_STATUSES.has(job.status);
      const hasStream = streams.current.has(job.id);
      if (!isFinal && !hasStream) {
        const source = new EventSource(`/api/jobs/${job.id}/stream`);
        source.onmessage = (event) => {
          const payload = JSON.parse(event.data);
          setJobs((prev) => mergeJob(prev, payload));
        };
        source.onerror = () => {
          source.close();
          streams.current.delete(job.id);
        };
        streams.current.set(job.id, source);
      }
      if (isFinal && hasStream) {
        const current = streams.current.get(job.id);
        current?.close();
        streams.current.delete(job.id);
      }
    });
  }, [jobs]);

  useEffect(
    () => () => {
      streams.current.forEach((source) => source.close());
      streams.current.clear();
    },
    [],
  );

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          artist: form.artist.trim(),
          url: form.url.trim(),
          dryRun: form.dryRun,
          keepTemp: form.keepTemp,
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Unable to start import');
      }
      const job = await response.json();
      setJobs((prev) => mergeJob(prev, job));
      setForm((prev) => ({ ...prev, artist: '', url: '' }));
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const disableSubmit = submitting || !form.artist.trim() || !form.url.trim();

  return (
    <div className="shell">
      <header className="hero">
        <div className="hero-text">
          <p className="eyebrow">nd-import</p>
          <h1>Import Pixeldrain drops without a terminal</h1>
          <p className="lede">
            Submit an artist and Pixeldrain link, then watch the backend stream download and stage updates in real time.
          </p>
          <div className="tags">
            <span>Live progress (SSE)</span>
            <span>Stage-aware queue</span>
            <span>Navidrome ready</span>
          </div>
        </div>
      </header>

      <main className="content">
        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">New import</p>
              <h2>Artist + Pixeldrain URL</h2>
            </div>
            {error && <div className="error-chip">{error}</div>}
          </div>

          <form className="form" onSubmit={handleSubmit}>
            <label>
              <span>Artist name</span>
              <input
                name="artist"
                value={form.artist}
                onChange={(e) => setForm((prev) => ({ ...prev, artist: e.target.value }))}
                placeholder="e.g., Hollow Coves"
                required
              />
            </label>
            <label>
              <span>Pixeldrain URL or ID</span>
              <input
                name="url"
                value={form.url}
                onChange={(e) => setForm((prev) => ({ ...prev, url: e.target.value }))}
                placeholder="https://pixeldrain.com/u/..."
                required
              />
            </label>

            <div className="advanced">
              <button type="button" className="ghost" onClick={() => setShowAdvanced((v) => !v)}>
                {showAdvanced ? 'Hide options' : 'Advanced options'}
              </button>
              {showAdvanced && (
                <div className="toggles">
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={form.dryRun}
                      onChange={(e) => setForm((prev) => ({ ...prev, dryRun: e.target.checked }))}
                    />
                    <span>Dry run (validate without moving files)</span>
                  </label>
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={form.keepTemp}
                      onChange={(e) => setForm((prev) => ({ ...prev, keepTemp: e.target.checked }))}
                    />
                    <span>Keep temp files</span>
                  </label>
                </div>
              )}
            </div>

            <button type="submit" disabled={disableSubmit} className="primary">
              {submitting ? 'Starting…' : 'Start import'}
            </button>
          </form>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Jobs</p>
              <h2>Active & recent imports</h2>
            </div>
            <span className="hint">Queue runs one job at a time to avoid collisions</span>
          </div>
          <div className="jobs-grid">
            {jobs.length === 0 && <p className="empty">No imports yet. Start one above.</p>}
            {jobs.map((job) => (
              <JobCard key={job.id} job={job} />
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
