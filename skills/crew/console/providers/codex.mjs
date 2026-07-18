// Provider contract: export async function snapshot({projectRoot, name, worker})
//   -> { phase: 'idle'|'working'|'done'|'unknown', detail, events: [{t,text}], updatedAt }
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const SESSIONS_DIR = path.join(os.homedir(), '.codex', 'sessions');

function tail(file, maxBytes = 250_000) {
  const size = fs.statSync(file).size;
  const fd = fs.openSync(file, 'r');
  const len = Math.min(size, maxBytes);
  const buf = Buffer.alloc(len);
  fs.readSync(fd, buf, 0, len, size - len);
  fs.closeSync(fd);
  const lines = buf.toString('utf8').split('\n');
  if (size > maxBytes) lines.shift();
  return lines.filter(Boolean);
}

function findSessionFile(sessionId) {
  let best = null;
  const walk = (dir, depth) => {
    if (depth > 4) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p, depth + 1);
      else if (e.name.includes(sessionId)) {
        const m = fs.statSync(p).mtimeMs;
        if (!best || m > best.mtimeMs) best = { path: p, mtimeMs: m };
      }
    }
  };
  walk(SESSIONS_DIR, 0);
  return best?.path || null;
}

function describe(obj) {
  // Tolerant of both `codex exec --json` events and session rollout lines.
  const item = obj.item || obj.payload || obj;
  const type = item.type || obj.type || '';
  if (Array.isArray(item.content)) {
    const text = item.content.map(c => c?.text || '').join(' ').trim();
    if (text) return { kind: item.role === 'user' ? 'cmd' : 'msg', text: text.slice(0, 300) };
  }
  if (item.name && item.arguments) return { kind: 'cmd', text: `tool: ${item.name}` };
  if (type === 'agent_message' || item.text) return { kind: 'msg', text: String(item.text || '').slice(0, 300) };
  if (type === 'command_execution' || item.command) return { kind: 'cmd', text: '$ ' + String(item.command || '').slice(0, 160) };
  if (type === 'file_change' && Array.isArray(item.changes)) {
    return { kind: 'file', text: 'edit: ' + item.changes.map(c => path.basename(c.path || '')).join(', ').slice(0, 160) };
  }
  if ((obj.type || '') === 'turn.completed') return { kind: 'end', text: 'turn completed' };
  return null;
}

export async function snapshot({ worker }) {
  const at = worker.activeTask;
  let src = null, viaTask = false;
  if (at?.outputFile && fs.existsSync(at.outputFile)) { src = at.outputFile; viaTask = true; }
  else if (worker.session) src = findSessionFile(worker.session);
  if (!src) return { phase: 'unknown', detail: 'no observable stream (no active task, session file not found)', events: [], updatedAt: null };

  const mtime = fs.statSync(src).mtimeMs;
  const events = [];
  let lastMsg = null, lastCmd = null, terminal = false;
  for (const line of tail(src)) {
    let obj; try { obj = JSON.parse(line); } catch { continue; }
    const d = describe(obj);
    if (!d) continue;
    if (d.kind === 'end') terminal = true;
    if (d.kind === 'msg') lastMsg = d.text;
    if (d.kind === 'cmd') lastCmd = d.text;
    events.push({ t: mtime, text: d.text });
  }
  const fresh = Date.now() - mtime < 120_000;
  const phase = viaTask && terminal ? 'done' : fresh ? 'working' : 'idle';
  return {
    phase,
    detail: lastMsg || lastCmd || (viaTask ? 'dispatch stream open, no events yet' : 'session stream'),
    events: events.slice(-8),
    updatedAt: mtime,
  };
}
