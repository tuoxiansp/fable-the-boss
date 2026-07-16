# fable-the-boss

Claude as the boss. Codex and Cursor as the crew.

A [Claude Code](https://claude.com/claude-code) skill that turns Claude into a task
orchestrator which dispatches work to other coding harnesses — OpenAI Codex CLI,
Cursor Agent — running as true background processes. The boss assigns work, goes idle
at zero cost, gets woken up when a worker finishes, reads the report, and decides:
accept, iterate, or discard.

## Why

Different harnesses have different strengths, different models, and separate usage
quotas. This skill lets one Claude session use them all as execution units while
keeping a single point of judgment, and burning no tokens while they work:

- **Claude orchestrates** — composes self-contained task prompts, reviews reports,
  merges or discards results, escalates real decisions to you.
- **Executors execute** — each is a long-lived session of an external harness
  (`codex exec resume`, `cursor-agent --resume`) that keeps its memory across tasks.
- **True background execution** — dispatch uses Claude Code's background task
  mechanism; the orchestrator ends its turn after dispatching and is woken by a task
  notification when the worker's process exits. No polling, no blocked turns.

## Design

Three principles, each of which fell out of a real failure of the naive design:

1. **Session and workspace are decoupled.** An executor's session (its memory) is
   long-lived. Its workspace is a disposable git worktree created per task from the
   orchestrator's current HEAD, and destroyed once the result is merged or discarded.
   Work is always based on the latest codebase by construction — there is no sync
   step to forget.

2. **The orchestrator stays at the reporting surface.** On wake it reads the
   executor's final report, the exit code, and `git diff --stat` — not the code. The
   executor's own verification (tests, builds) backs quality; the orchestrator does
   fact-checking (does the report match the observable footprint?), and code review
   happens only when you ask for it.

3. **Isolation by worktree, not by OS sandbox.** Executors run with full access
   (`--dangerously-bypass-approvals-and-sandbox` / `--sandbox disabled`) because OS
   sandboxes break legitimate work — spawning browsers for test runners, process
   control, network — while the disposable worktree already confines the blast
   radius. Your main working tree is never touched.

Executors can also stop mid-task and ask for advice (`NEED_ADVICE:` protocol). The
orchestrator answers what it can and escalates to you only what is genuinely yours to
decide: scope trade-offs, irreversible choices.

## Install

```sh
git clone https://github.com/b1ncer/fable-the-boss ~/fable-the-boss
ln -s ~/fable-the-boss ~/.claude/skills/executor
```

Requirements: Claude Code with background tasks support, plus at least one harness:

- [Codex CLI](https://developers.openai.com/codex/cli) — `brew install codex`, then `codex login`
- [Cursor Agent](https://cursor.com/cli) — `curl https://cursor.com/install -fsS | bash`, then `cursor-agent login`

## Use

Register execution units (per project; config lives in `.claude/executors.json`):

```
/executor add codex
/executor add cursor --model gpt-5.2
/executor add codex --session <existing-session-id> --name reviewer
/executor list
```

Dispatch explicitly, in natural language:

> have codex implement the retry logic in src/net/, run the tests, and commit

Claude cuts a worktree, dispatches in the background, and yields. When the worker
finishes you get the report and rule on it: accept (merge), iterate (same session,
corrective feedback), or discard. Either way the worktree is destroyed.

The orchestrator may also create new units on its own when the work calls for a
parallel lane — creating units is free, dispatching still requires your word.

## License

MIT
