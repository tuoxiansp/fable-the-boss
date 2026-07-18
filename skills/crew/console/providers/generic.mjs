// Fallback provider: tails the dispatch output file as plain text.
import fs from 'node:fs';

export async function snapshot({ worker }) {
  const at = worker.activeTask;
  if (!at?.outputFile || !fs.existsSync(at.outputFile)) {
    return { phase: 'unknown', detail: 'no observable stream', events: [], updatedAt: null };
  }
  const mtime = fs.statSync(at.outputFile).mtimeMs;
  const lines = fs.readFileSync(at.outputFile, 'utf8').split('\n').filter(Boolean);
  return {
    phase: Date.now() - mtime < 120_000 ? 'working' : 'idle',
    detail: lines.slice(-3).join('\n').slice(0, 300),
    events: lines.slice(-8).map(l => ({ t: mtime, text: l.slice(0, 160) })),
    updatedAt: mtime,
  };
}
