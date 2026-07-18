#!/usr/bin/env node
// crew-console — local web console for fable-the-boss workers.
//   crew-console watch [dir]   enroll a project and ensure the console daemon runs
//   crew-console serve         run the daemon in the foreground (watch spawns this)
//   crew-console status        print enrolled projects and daemon state
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const CONSOLE_ROOT = path.dirname(SELF);
const STATE_DIR = path.join(os.homedir(), '.claude-crew', 'console');
const STATE_FILE = path.join(STATE_DIR, 'projects.json');
const DEFAULT_PORT = 7317;

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); }
  catch { return { port: DEFAULT_PORT, projects: [] }; }
}
function saveState(s) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));
}
async function ping(port) {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/ping`, { signal: AbortSignal.timeout(700) });
    return r.ok;
  } catch { return false; }
}

function readRegistry(projectRoot) {
  for (const f of ['crews.json', 'executors.json']) {
    const p = path.join(projectRoot, '.claude', f);
    try { return { file: f, data: JSON.parse(fs.readFileSync(p, 'utf8')) }; } catch {}
  }
  return null;
}

async function loadProvider(harness, projectRoot) {
  const candidates = [
    path.join(projectRoot, '.claude', 'crew-providers', `${harness}.mjs`),
    path.join(CONSOLE_ROOT, 'providers', `${harness}.mjs`),
    path.join(CONSOLE_ROOT, 'providers', 'generic.mjs'),
  ];
  for (const c of candidates) {
    if (!fs.existsSync(c)) continue;
    try {
      const mod = await import(pathToFileURL(c).href + `?t=${fs.statSync(c).mtimeMs}`);
      if (typeof mod.snapshot === 'function') return { snapshot: mod.snapshot, source: c };
    } catch (e) {
      return { snapshot: async () => ({ phase: 'unknown', detail: `provider error: ${e.message}`, events: [], updatedAt: null }), source: c };
    }
  }
  return { snapshot: async () => ({ phase: 'unknown', detail: 'no provider', events: [], updatedAt: null }), source: null };
}

async function buildState() {
  const state = loadState();
  const projects = [];
  for (const root of state.projects) {
    const reg = readRegistry(root);
    const proj = { root, name: path.basename(root), registryFile: reg?.file || null, workers: [] };
    if (reg) {
      for (const [name, w] of Object.entries(reg.data)) {
        if (name.startsWith('$')) continue;
        const provider = await loadProvider(w.harness || 'generic', root);
        let snap;
        try { snap = await provider.snapshot({ projectRoot: root, name, worker: w }); }
        catch (e) { snap = { phase: 'unknown', detail: `snapshot failed: ${e.message}`, events: [], updatedAt: null }; }
        proj.workers.push({
          name,
          harness: w.harness || '?',
          model: w.model || null,
          displayName: w.displayName || null,
          note: w.note || null,
          activeTask: w.activeTask || null,
          snapshot: snap,
        });
      }
    }
    projects.push(proj);
  }
  return { generatedAt: Date.now(), projects };
}

const PAGE = `<!doctype html><meta charset="utf-8"><title>crew console</title>
<style>
:root{color-scheme:light dark;font-family:ui-sans-serif,system-ui,sans-serif}
body{margin:2rem auto;max-width:1080px;padding:0 1rem;line-height:1.5}
h1{font-size:20px;font-weight:600}h2{font-size:15px;font-weight:600;margin:1.4em 0 .4em;opacity:.85}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px}
.card{border:1px solid color-mix(in srgb,currentColor 18%,transparent);border-radius:10px;padding:12px 14px}
.hd{display:flex;justify-content:space-between;align-items:baseline;gap:8px}
.nm{font-weight:600}.mono{font-family:ui-monospace,monospace;font-size:12px;opacity:.75}
.ph{font-size:12px;padding:1px 8px;border-radius:99px;border:1px solid transparent}
.ph.working{background:#1d9e7522;border-color:#1d9e75;color:#1d9e75}
.ph.done{background:#378add22;border-color:#378add;color:#378add}
.ph.idle{opacity:.6;border-color:color-mix(in srgb,currentColor 30%,transparent)}
.ph.unknown{opacity:.45}
.dt{font-size:13px;margin:.5em 0;white-space:pre-wrap;word-break:break-word}
.ev{font-size:12px;opacity:.7;margin:.15em 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-family:ui-monospace,monospace}
.ago{font-size:11px;opacity:.55}.task{font-size:12px;opacity:.75;font-style:italic}
</style>
<h1>crew console</h1><div id="app">loading…</div>
<script>
const ago=t=>{if(!t)return'';const s=(Date.now()-t)/1000;return s<90?Math.round(s)+'s ago':s<5400?Math.round(s/60)+'m ago':Math.round(s/3600)+'h ago'};
const esc=x=>String(x??'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
async function tick(){
  try{
    const st=await (await fetch('/api/state')).json();
    document.getElementById('app').innerHTML=st.projects.map(p=>
      '<h2>'+esc(p.name)+' <span class="mono">'+esc(p.root)+'</span></h2><div class="grid">'+
      (p.workers.length?p.workers.map(w=>{
        const s=w.snapshot||{};
        return '<div class="card"><div class="hd"><span class="nm">'+esc(w.displayName||w.name)+
        ' <span class="mono">'+esc(w.harness)+(w.model?' · '+esc(w.model):'')+'</span></span>'+
        '<span class="ph '+esc(s.phase||'unknown')+'">'+esc(s.phase||'unknown')+'</span></div>'+
        (w.activeTask?'<div class="task">'+esc(w.activeTask.slug||'')+' '+esc(w.activeTask.description||'')+'</div>':'')+
        '<div class="dt">'+esc(s.detail||'')+'</div>'+
        (s.events||[]).slice(-4).map(e=>'<div class="ev">'+esc(e.text)+'</div>').join('')+
        '<div class="ago">'+ago(s.updatedAt)+'</div></div>';
      }).join(''):'<div class="card">no workers registered</div>')+'</div>'
    ).join('')||'no projects enrolled — run: crew-console watch <project>';
  }catch(e){document.getElementById('app').textContent='console daemon unreachable: '+e.message}
  setTimeout(tick,3000);
}
tick();
</script>`;

function serve() {
  const port = loadState().port || DEFAULT_PORT;
  http.createServer(async (req, res) => {
    if (req.url === '/ping') { res.end('ok'); return; }
    if (req.url === '/api/state') {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(await buildState()));
      return;
    }
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end(PAGE);
  }).listen(port, '127.0.0.1', () => console.log(`crew console on http://127.0.0.1:${port}/`));
}

async function watch(dirArg) {
  const proj = path.resolve(dirArg || process.cwd());
  const state = loadState();
  if (!state.projects.includes(proj)) { state.projects.push(proj); saveState(state); }
  const port = state.port || DEFAULT_PORT;
  if (!(await ping(port))) {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    const log = fs.openSync(path.join(STATE_DIR, 'server.log'), 'a');
    spawn(process.execPath, [SELF, 'serve'], { detached: true, stdio: ['ignore', log, log] }).unref();
    for (let i = 0; i < 20 && !(await ping(port)); i++) await new Promise(r => setTimeout(r, 300));
  }
  console.log(`crew console: http://127.0.0.1:${port}/  (watching ${proj})`);
}

async function status() {
  const state = loadState();
  const up = await ping(state.port || DEFAULT_PORT);
  console.log(JSON.stringify({ daemon: up ? 'up' : 'down', port: state.port || DEFAULT_PORT, projects: state.projects }, null, 2));
}

const [cmd, arg] = process.argv.slice(2);
if (cmd === 'serve') serve();
else if (cmd === 'watch') watch(arg);
else if (cmd === 'status') status();
else { console.log('usage: crew-console watch [dir] | serve | status'); process.exit(1); }
