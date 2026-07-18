#!/usr/bin/env python3
"""crew-monitor: live tail of crew worker activity.

Zero-dependency read-only observer. It watches the background-task output files
that dispatches stream their JSONL events into, and renders one line per worker
action. It never writes anything and never touches the sessions.

Usage:
  python3 crew-monitor.py [glob ...]

Default globs cover Claude Code background-task output files. Pass explicit
globs/files to watch something else. Ctrl-C to quit.
"""
import glob
import json
import os
import sys
import time

DEFAULT_GLOBS = [
    "/private/tmp/claude-*/*/tasks/*.output",
    "/tmp/claude-*/*/tasks/*.output",
]
ACTIVE_WINDOW_S = 30 * 60  # only follow files touched in the last 30 minutes
DIM = "\033[2m"
BOLD = "\033[1m"
RESET = "\033[0m"


def short(path):
    return os.path.basename(path).replace(".output", "")


def describe(event):
    t = event.get("type", "")
    item = event.get("item") or {}
    it = item.get("type", "")
    if t == "thread.started":
        return f"session {event.get('thread_id', '?')[:13]}… resumed"
    if t == "turn.completed":
        u = event.get("usage") or {}
        return f"turn completed ({u.get('output_tokens', '?')} out tokens)"
    if t == "error":
        return f"{BOLD}error:{RESET} {event.get('message', '')[:120]}"
    if it == "agent_message" and t == "item.completed":
        return f"says: {item.get('text', '')[:110]}"
    if it == "command_execution":
        cmd = (item.get("command") or "").replace("\n", " ")[:90]
        if t == "item.started":
            return f"$ {cmd}"
        status = item.get("status", "?")
        code = item.get("exit_code")
        return f"{DIM}$ {cmd} → {status} (exit {code}){RESET}"
    if it == "file_change" and t == "item.completed":
        changes = item.get("changes") or []
        names = ", ".join(os.path.basename(c.get("path", "?")) for c in changes[:4])
        return f"edits: {names}"
    if it == "reasoning":
        return None
    if t == "item.started":
        return None
    if it:
        return f"{it} {t.split('.')[-1]}"
    # cursor-agent single-result JSON
    if t == "result":
        return f"result: {str(event.get('result', ''))[:110]}"
    return None


def main():
    patterns = sys.argv[1:] or DEFAULT_GLOBS
    offsets = {}
    print(f"{DIM}crew-monitor: watching {', '.join(patterns)}{RESET}")
    while True:
        now = time.time()
        files = []
        for p in patterns:
            files.extend(glob.glob(p))
        live = [f for f in files if now - os.path.getmtime(f) < ACTIVE_WINDOW_S]
        for f in sorted(live, key=os.path.getmtime):
            size = os.path.getsize(f)
            pos = offsets.get(f, max(0, size - 65536) if f not in offsets else 0)
            if size <= pos:
                continue
            with open(f, "r", errors="replace") as fh:
                fh.seek(pos)
                chunk = fh.read()
                offsets[f] = fh.tell()
            for line in chunk.splitlines():
                line = line.strip()
                if not line.startswith("{"):
                    continue
                try:
                    event = json.loads(line)
                except json.JSONDecodeError:
                    continue
                msg = describe(event)
                if msg:
                    stamp = time.strftime("%H:%M:%S")
                    print(f"{DIM}{stamp}{RESET} {BOLD}{short(f)}{RESET}  {msg}")
        sys.stdout.flush()
        time.sleep(1)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        pass
