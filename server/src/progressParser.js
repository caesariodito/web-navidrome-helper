import { setTimeout as delay } from 'node:timers/promises';

const STAGE_MATCHERS = [
  { stage: 'Downloading', test: (line) => /download/i.test(line) },
  { stage: 'Extracting', test: (line) => /extract/i.test(line) },
  { stage: 'Pruning', test: (line) => /prun/i.test(line) },
  { stage: 'Checking collisions', test: (line) => /collision/i.test(line) },
  { stage: 'Moving', test: (line) => /\bmove/i.test(line) },
  { stage: 'Cleaning up', test: (line) => /clean/i.test(line) },
];

const UNIT_MULTIPLIER = {
  b: 1,
  kb: 1000,
  kib: 1024,
  mb: 1000 * 1000,
  mib: 1024 * 1024,
  gb: 1000 * 1000 * 1000,
  gib: 1024 * 1024 * 1024,
};

function parseBytes(value, unit) {
  if (!value) return undefined;
  const multiplier = UNIT_MULTIPLIER[unit?.toLowerCase?.() ?? ''] || 1;
  return Math.round(parseFloat(value) * multiplier);
}

function parseEta(line) {
  const match = line.match(/eta[:\s]*((\d{1,2}):(\d{2})(?::(\d{2}))?)/i);
  if (!match) return undefined;
  const [, , first, second, third] = match;
  const primary = parseInt(first ?? '0', 10) || 0;
  const secondary = parseInt(second ?? '0', 10) || 0;
  const tertiary = parseInt(third ?? '0', 10) || 0;
  if (third !== undefined) {
    return primary * 3600 + secondary * 60 + tertiary;
  }
  return primary * 60 + secondary;
}

function extractSizes(line) {
  const matches = [...line.matchAll(/([0-9.]+)\s*(kib|kb|mib|mb|gib|gb|b)/gi)];
  if (matches.length === 0) return undefined;
  const [first, second] = matches;
  const downloadedBytes = parseBytes(first[1], first[2]);
  const totalBytes = second ? parseBytes(second[1], second[2]) : undefined;
  return { downloadedBytes, totalBytes };
}

function parseSpeed(line) {
  const match = line.match(/([0-9.]+)\s*(kib|kb|mib|mb|gib|gb|b)\/s/i);
  if (!match) return undefined;
  return parseBytes(match[1], match[2]);
}

export function parseDownloadProgress(line) {
  const percentMatch = line.match(/(\d+(?:\.\d+)?)%/);
  if (!percentMatch) return undefined;
  const percent = parseFloat(percentMatch[1]);
  const sizes = extractSizes(line) ?? {};
  const etaSeconds = parseEta(line);
  const speed = parseSpeed(line);
  return {
    percent: Number.isFinite(percent) ? percent : undefined,
    ...sizes,
    speedBps: speed,
    etaSeconds,
  };
}

export function parseStats(line) {
  const stats = {};
  const downloadBytes = line.match(/download(?:ed)?[^0-9]*([\d,]+)\s*bytes/i);
  const extracted = line.match(/extracted[^0-9]*([\d,]+)\s*(?:entries|files)/i);
  const pruned = line.match(/pruned[^0-9]*([\d,]+)\s*(?:files?|entries?)/i);
  const moved = line.match(/moved[^0-9]*([\d,]+)\s*(?:files?|entries?)/i);
  if (downloadBytes) stats.downloadedBytes = parseInt(downloadBytes[1].replace(/,/g, ''), 10);
  if (extracted) stats.extractedEntries = parseInt(extracted[1].replace(/,/g, ''), 10);
  if (pruned) stats.prunedCount = parseInt(pruned[1].replace(/,/g, ''), 10);
  if (moved) stats.movedCount = parseInt(moved[1].replace(/,/g, ''), 10);
  return Object.keys(stats).length ? stats : undefined;
}

export function parseStage(line) {
  const match = STAGE_MATCHERS.find((candidate) => candidate.test(line));
  return match?.stage;
}

export function parseLine(line) {
  const stage = parseStage(line);
  const progress = parseDownloadProgress(line);
  const stats = parseStats(line);
  return { stage, progress, stats };
}

export async function simulateImportProgress(emit) {
  const steps = [
    { stage: 'Downloading', duration: 2200 },
    { stage: 'Extracting', duration: 900 },
    { stage: 'Pruning', duration: 650 },
    { stage: 'Checking collisions', duration: 700 },
    { stage: 'Moving', duration: 800 },
    { stage: 'Cleaning up', duration: 500 },
  ];

  let percent = 0;
  for (const step of steps) {
    emit({ type: 'stage', stage: step.stage });
    if (step.stage === 'Downloading') {
      const increments = 10;
      for (let i = 0; i < increments; i += 1) {
        percent = Math.min(100, percent + 100 / increments);
        emit({
          type: 'progress',
          stage: 'Downloading',
          progress: {
            percent,
            downloadedBytes: Math.round((percent / 100) * 80 * 1024 * 1024),
            totalBytes: 80 * 1024 * 1024,
            etaSeconds: Math.max(0, ((increments - i - 1) * step.duration) / 1000),
          },
        });
        await delay(step.duration / increments);
      }
    } else {
      await delay(step.duration);
    }
  }

  emit({
    type: 'stats',
    stats: {
      downloadedBytes: 80 * 1024 * 1024,
      extractedEntries: 22,
      prunedCount: 4,
      movedCount: 18,
    },
  });
}
