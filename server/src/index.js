import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { JobManager } from './jobManager.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..', '..');
const envResult = dotenv.config({ path: path.join(projectRoot, '.env') });
// eslint-disable-next-line no-console
console.log('nd-import backend loading environment variables:');
const loadedEnv = envResult.parsed ?? {};
Object.entries(loadedEnv).forEach(([key, value]) => {
  // eslint-disable-next-line no-console
  console.log(`  ${key}=${value}`);
});
const app = express();
const jobs = new JobManager();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    mock: process.env.MOCK_IMPORT === '1',
    navidromeMusicPath: process.env.NAVIDROME_MUSIC_PATH ?? null,
  });
});

app.get('/api/jobs', (req, res) => {
  res.json(jobs.listJobs().map((job) => jobs.summarize(job)));
});

app.get('/api/jobs/:id', (req, res) => {
  const job = jobs.getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  return res.json(jobs.summarize(job));
});

app.get('/api/jobs/:id/stream', (req, res) => {
  const job = jobs.getJob(req.params.id);
  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.flushHeaders?.();
  res.write(`data: ${JSON.stringify(jobs.summarize(job))}\n\n`);

  const sendUpdate = (payload) => {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  const interval = setInterval(() => {
    res.write(': keep-alive\n\n');
  }, 20000);

  const unsubscribe = jobs.onJobUpdate(job.id, sendUpdate);
  req.on('close', () => {
    clearInterval(interval);
    unsubscribe();
  });
});

app.post('/api/jobs', (req, res) => {
  const { artist, url, dryRun = false, keepTemp = false } = req.body ?? {};
  if (!artist || !artist.trim()) return res.status(400).json({ error: 'Artist is required' });
  if (!url || !url.trim()) return res.status(400).json({ error: 'Pixeldrain URL or ID is required' });
  if (!process.env.NAVIDROME_MUSIC_PATH && process.env.MOCK_IMPORT !== '1') {
    return res.status(400).json({ error: 'NAVIDROME_MUSIC_PATH environment variable is required' });
  }
  if (jobs.hasActiveJobForArtist(artist)) {
    return res.status(409).json({ error: 'An import for this artist is already in progress' });
  }
  const job = jobs.createJob({ artist, url, dryRun, keepTemp });
  return res.status(202).json(jobs.summarize(job));
});

const distPath = path.join(projectRoot, 'web', 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.listen(port, () => {
  const mode = process.env.MOCK_IMPORT === '1' ? 'MOCK' : 'real';
  // eslint-disable-next-line no-console
  console.log(`nd-import backend listening on port ${port} (${mode} mode)`);
});
