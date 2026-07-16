# fable-the-boss

Your agent as the boss. Codex and Cursor as the crew.

## The patterns, straight from Anthropic

Anthropic's developer team [shared the two multi-agent patterns they use internally
with Claude Fable 5](https://x.com/ClaudeDevs/status/2074606058128224365):

<p>
  <img src="https://pbs.twimg.com/media/HMp6DWEa4AE10vQ?format=jpg&name=medium" alt="Orchestrator pattern: Fable 5 plans and fans out to Sonnet 5 workers" width="49%">
  <img src="https://pbs.twimg.com/media/HMp3rAEaAAAUpHe?format=jpg&name=medium" alt="Advisor pattern: a Sonnet 5 executor tool-calls Fable 5 for advice" width="49%">
</p>

<sub>Diagrams by Anthropic, from the @ClaudeDevs thread.</sub>

- **Orchestrator** (top-down): Fable 5 plans and delegates to cheaper workers; most
  tokens are billed at the worker rate. 96% of Fable-solo performance at 46% of the
  cost on BrowseComp.
- **Advisor** (bottom-up): an executor consults Fable 5 only at decision points;
  ~92% of Fable's SWE-bench Pro score at ~63% of the price, with roughly one consult
  per task.

The economics work because orchestration is mostly decision-making in
underdetermined spaces — vague reports, partial evidence, judgment calls with no
spec — which is exactly what Fable 5 is unusually good at, and exactly what the
cheap majority of tokens doesn't need.

## This skill: the same structure, across harnesses

fable-the-boss reconstructs both patterns as a single agent skill — with the crew
drawn from *other vendors' harnesses* instead of cheaper Claude models:

- **Orchestrator** → the boss (your agent) composes self-contained task prompts and
  dispatches them to long-lived worker sessions of OpenAI Codex CLI or Cursor Agent
  (`codex exec resume`, `cursor-agent --resume`), running as true background
  processes. The economics get more aggressive than the original: worker tokens are
  billed to each harness's own subscription, and the boss burns exactly zero tokens
  while waiting.
- **Advisor** → the `NEED_ADVICE:` protocol. The official advisor is an inline tool
  call; headless worker CLIs cannot call back mid-run, so this skill uses the
  turn-boundary equivalent — the worker stops and reports what advice it needs, the
  boss answers (escalating to you only what is genuinely yours to decide), and the
  same session resumes.

Where the official patterns require Claude models on both sides (the advisor tool
is beta, with model-pair constraints), this skill only asks that the boss's harness
can wake on background-task completion — the crew can come from any vendor, and you
get to spend all your separate quotas in one place.

## How it works

One task, end to end:

```mermaid
sequenceDiagram
    actor U as You
    participant B as Boss (orchestrator)
    participant G as Git worktree
    participant W as Worker (codex / cursor)
    U->>B: "have codex fix the retry logic"
    B->>G: cut worktree from current HEAD
    B->>W: dispatch prompt (background, resume session)
    Note over B: end turn — zero cost while waiting
    W->>G: edit, run tests, commit
    W-->>B: process exits → wake notification
    B->>B: read report + diff --stat (facts, not code)
    B->>U: relay report + change footprint
    U->>B: accept / iterate / discard
    B->>G: merge or drop, destroy worktree
```

The exposure surfaces, layer by layer:

```mermaid
flowchart LR
    subgraph L1["User surface"]
        direction TB
        A1["/executor<br>add · list · remove"]
        A2["explicit dispatch<br>'have codex do X'"]
        A3["verdict<br>accept · iterate · discard"]
    end
    subgraph L2["Orchestrator"]
        direction TB
        B1["SKILL.md<br>behavior contract"]
        B2["executors.json<br>unit registry"]
        B3["compose prompt<br>check report vs facts"]
    end
    subgraph L3["Scheduling"]
        direction TB
        C1["background task"]
        C2["yield turn<br>no polling"]
        C3["wake on completion"]
    end
    subgraph L4["Execution units"]
        direction TB
        D1["codex exec resume"]
        D2["cursor-agent --resume"]
        D3["long-lived session<br>memory across tasks"]
    end
    subgraph L5["Git isolation"]
        direction TB
        E1["per-task worktree<br>cut from HEAD"]
        E2["branch<br>executor/name/task"]
        E3["merge or discard<br>then destroy"]
    end
    L1 --> L2 --> L3 --> L4 --> L5
```

Three design principles, each of which fell out of a real failure of the naive
design:

1. **Session and workspace are decoupled.** A worker's session (its memory) is
   long-lived. Its workspace is a disposable git worktree created per task from the
   boss's current HEAD, and destroyed once the result is merged or discarded. Work is
   always based on the latest codebase by construction — there is no sync step to
   forget.

2. **The boss stays at the reporting surface.** On wake it reads the worker's final
   report, the exit code, and `git diff --stat` — not the code. The worker's own
   verification (tests, builds) backs quality; the boss does fact-checking (does the
   report match the observable footprint?), and code review happens only when you ask
   for it.

3. **Isolation by worktree, not by OS sandbox.** Workers run with full access
   (`--dangerously-bypass-approvals-and-sandbox` / `--sandbox disabled`) because OS
   sandboxes break legitimate work — spawning browsers for test runners, process
   control, network — while the disposable worktree already confines the blast
   radius. Your main working tree is never touched.

## Install

Via [skills.sh](https://skills.sh) (installs into Claude Code, Codex, and other
Agent-Skills-standard harnesses):

```bash
npx skills@latest add tuoxiansp/fable-the-boss
```

Or manually:

```bash
git clone https://github.com/tuoxiansp/fable-the-boss ~/fable-the-boss
ln -s ~/fable-the-boss/skills/executor ~/.claude/skills/executor
```

You also need at least one worker harness:

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

The boss cuts a worktree, dispatches in the background, and yields. When the worker
finishes you get the report and rule on it: accept (merge), iterate (same session,
corrective feedback), or discard. Either way the worktree is destroyed.

The boss may also create new units on its own when the work calls for a parallel
lane — creating units is free, dispatching still requires your word.

## Is your harness boss material?

The boss side needs exactly one capability: start a process in the background, end
the turn, and get woken when the process exits. Paste this probe into your agent to
find out (it is the exact prompt that bootstrapped this project):

```
This is a harness capability test. Follow these steps EXACTLY. Do not improvise.

1. Print the current time with `date +%T`.
2. Start this command as a TRUE BACKGROUND task (do NOT run it as a normal
   blocking/foreground tool call):
   sh -c 'sleep 180; date +%T > /tmp/harness-wake-test.txt; echo WAKE_SENTINEL'
   If your environment has a dedicated way to run a command in the background
   (a background flag, a task/job tool, etc.), use it. If you have NO way to
   run a command without blocking on it, say exactly "NO_BACKGROUND_SUPPORT"
   and stop.
3. After starting it, END YOUR TURN IMMEDIATELY. Your last message must be
   exactly: "STARTED_AND_YIELDING".
   - Do NOT wait for the command.
   - Do NOT sleep, poll, re-check, or read the output file.
   - Do NOT call any more tools this turn.
4. ONLY IF something wakes you up later (a notification, an injected message,
   a tool event), reply with:
   - the word "WOKEN_BY_HARNESS"
   - the current time from `date +%T`
   - the raw content of whatever woke you, quoted verbatim
   - the content of /tmp/harness-wake-test.txt

Never simulate step 4. If nothing ever wakes you, stay silent forever.
```

If you get `STARTED_AND_YIELDING`, then ~3 minutes of silence, then
`WOKEN_BY_HARNESS` with a timestamp ~180s after the first one — your harness can be
the boss. If the agent blocks on the command, answers immediately, or never comes
back, it can still be a fine *worker*, just not the boss.

## The name

A nod to Claude Fable 5 — the model whose usage patterns this skill reconstructs,
the first model to boss this particular crew around, and the recommended boss. The
skill itself is model-agnostic.

## License

MIT
