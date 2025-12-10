import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { parseLine, simulateImportProgress } from './progressParser.js';

function handleStream(stream, name, onLine) {
  let buffer = '';
  stream.on('data', (chunk) => {
    buffer += chunk.toString();
    let idx;
    while ((idx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (line) onLine(line, name);
    }
  });
  stream.on('end', () => {
    if (buffer.trim()) onLine(buffer.trim(), name);
    buffer = '';
  });
}

async function runRealNdImport(job, emit) {
  const binary = process.env.ND_IMPORT_BIN?.trim() || 'nd-import';
  const args = ['--artist', job.artist, '--url', job.url];
  if (job.dryRun) args.push('--dry-run');
  if (job.keepTemp) args.push('--keep-temp');

  const child = spawn(binary, args, {
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const onLine = (line, source) => {
    emit({ type: 'log', message: line, stream: source });
    const parsed = parseLine(line);
    if (parsed.stage) emit({ type: 'stage', stage: parsed.stage });
    if (parsed.progress) emit({ type: 'progress', stage: 'Downloading', progress: parsed.progress });
    if (parsed.stats) emit({ type: 'stats', stats: parsed.stats });
  };

  handleStream(child.stdout, 'stdout', onLine);
  handleStream(child.stderr, 'stderr', onLine);

  const [code, signal] = await once(child, 'close');
  return { code, signal };
}

async function runMock(job, emit) {
  emit({ type: 'log', message: 'Running in MOCK mode; no files will be fetched.', stream: 'stdout' });
  await simulateImportProgress(emit);
  emit({ type: 'log', message: 'Mock import finished', stream: 'stdout' });
  return { code: 0 };
}

export async function runNdImport(job, emit) {
  if (process.env.MOCK_IMPORT === '1') {
    return runMock(job, emit);
  }
  try {
    return await runRealNdImport(job, emit);
  } catch (error) {
    emit({ type: 'log', message: error.message, stream: 'stderr' });
    return { code: -1, error };
  }
}
