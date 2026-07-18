// cursor-agent provider: observes the dispatch output stream (json / stream-json).
import fs from 'node:fs';

export async function snapshot({ worker }) {
  const at = worker.activeTask;
  if (!at?.outputFile || !fs.existsSync(at.outputFile)) {
    return { phase: 'unknown', detail: 'no active dispatch stream', events: [], updatedAt: null };
  }
  const mtime = fs.statSync(at.outputFile).mtimeMs;
  const lines = fs.readFileSync(at.outputFile, 'utf8').split('\n').filter(Boolean).slice(-200);
  const events = [];
  let result = null;
  for (const line of lines) {
    let obj; try { obj = JSON.parse(line); } catch { continue; }
    if (obj.type === 'result') result = obj;
    else if (obj.type) events.push({ t: mtime, text: `${obj.type}${obj.subtype ? ':' + obj.subtype : ''}` });
  }
  const fresh = Date.now() - mtime < 120_000;
  return {
    phase: result ? 'done' : fresh ? 'working' : 'idle',
    detail: result ? String(result.result || '').slice(0, 300) : 'running',
    events: events.slice(-8),
    updatedAt: mtime,
  };
}
