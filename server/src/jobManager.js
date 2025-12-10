import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { runNdImport } from './ndImportRunner.js';

const LOG_LIMIT = 200;

const ACTIVE_STATES = new Set(['pending', 'running']);

function truncateLogs(logs) {
  if (logs.length <= LOG_LIMIT) return logs;
  return logs.slice(logs.length - LOG_LIMIT);
}

export class JobManager {
  constructor() {
    this.jobs = new Map();
    this.queue = [];
    this.currentJobId = null;
    this.listeners = new EventEmitter();
  }

  listJobs() {
    return Array.from(this.jobs.values()).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  getJob(id) {
    return this.jobs.get(id);
  }

  onJobUpdate(id, listener) {
    this.listeners.on(id, listener);
    return () => this.listeners.off(id, listener);
  }

  emitUpdate(job) {
    this.listeners.emit(job.id, this.summarize(job));
  }

  summarize(job) {
    const copy = structuredClone(job);
    copy.logs = truncateLogs(copy.logs);
    return copy;
  }

  createJob(payload) {
    const now = new Date().toISOString();
    const job = {
      id: randomUUID(),
      artist: payload.artist.trim(),
      url: payload.url.trim(),
      dryRun: Boolean(payload.dryRun),
      keepTemp: Boolean(payload.keepTemp),
      status: 'pending',
      stage: 'Pending',
      progress: null,
      stats: {},
      logs: [],
      createdAt: now,
      startedAt: null,
      finishedAt: null,
      exitCode: null,
      error: null,
    };
    this.jobs.set(job.id, job);
    this.queue.push(job.id);
    this.emitUpdate(job);
    this.processQueue();
    return job;
  }

  hasActiveJobForArtist(artist) {
    return this.listJobs().some(
      (job) => job.artist.toLowerCase() === artist.trim().toLowerCase() && ACTIVE_STATES.has(job.status),
    );
  }

  async processQueue() {
    if (this.currentJobId || this.queue.length === 0) return;
    const nextId = this.queue.shift();
    const job = this.jobs.get(nextId);
    if (!job) return this.processQueue();
    this.currentJobId = nextId;
    job.status = 'running';
    job.stage = 'Pending';
    job.startedAt = new Date().toISOString();
    // eslint-disable-next-line no-console
    console.log(
      `[job ${job.id}] Starting import for "${job.artist}" from "${job.url}" (dryRun=${job.dryRun}, keepTemp=${job.keepTemp})`,
    );
    this.emitUpdate(job);

    const applyUpdate = (update) => {
      if (update.type === 'log') {
        job.logs.push({ message: update.message, stream: update.stream, timestamp: new Date().toISOString() });
        job.logs = truncateLogs(job.logs);
      }
      if (update.type === 'stage' && update.stage) {
        job.stage = update.stage;
      }
      if (update.type === 'progress' && update.progress) {
        job.stage = update.stage ?? job.stage;
        job.progress = { ...job.progress, ...update.progress };
      }
      if (update.type === 'stats' && update.stats) {
        job.stats = { ...job.stats, ...update.stats };
      }
      this.emitUpdate(job);
    };

    const result = await runNdImport(job, applyUpdate);
    job.exitCode = result.code;
    job.status = result.code === 0 ? 'success' : 'failed';
    job.finishedAt = new Date().toISOString();
    if (result.error) job.error = result.error.message;
    if (result.signal) job.error = `Process terminated with signal ${result.signal}`;
    if (!job.stats?.downloadedBytes && job.progress?.downloadedBytes) {
      job.stats.downloadedBytes = job.progress.downloadedBytes;
    }
    if (job.status === 'success' && job.stage !== 'Done') {
      job.stage = 'Done';
    }
    if (job.status === 'failed') {
      job.stage = 'Failed';
    }
    this.emitUpdate(job);
    this.currentJobId = null;
    if (this.queue.length > 0) this.processQueue();
  }
}
