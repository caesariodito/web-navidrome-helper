import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDownloadProgress, parseLine, parseStage, parseStats } from '../src/progressParser.js';

test('parses percentage and byte sizes from download line', () => {
  const line = 'Downloading 25% 10 MiB / 40 MiB 1.2 MiB/s ETA 00:30';
  const result = parseDownloadProgress(line);
  assert.equal(result.percent, 25);
  assert.equal(result.downloadedBytes, 10 * 1024 * 1024);
  assert.equal(result.totalBytes, 40 * 1024 * 1024);
  assert.equal(result.speedBps, Math.round(1.2 * 1024 * 1024));
  assert.equal(result.etaSeconds, 30);
});

test('detects stages from log lines', () => {
  assert.equal(parseStage('Extracting archive'), 'Extracting');
  assert.equal(parseStage('Pruned 3 files'), 'Pruning');
  assert.equal(parseStage('Checking collisions under /music'), 'Checking collisions');
});

test('parses stats counts from log lines', () => {
  const stats = parseStats('Extracted 42 entries, pruned 5 files, moved 37 files');
  assert.equal(stats.extractedEntries, 42);
  assert.equal(stats.prunedCount, 5);
  assert.equal(stats.movedCount, 37);
});

test('parseLine surfaces stage, progress, and stats together', () => {
  const line = 'Downloading 50% 20 MiB / 40 MiB 2 MiB/s';
  const parsed = parseLine(line);
  assert.equal(parsed.stage, 'Downloading');
  assert.equal(parsed.progress.percent, 50);
  assert.equal(parsed.stats, undefined);
});
