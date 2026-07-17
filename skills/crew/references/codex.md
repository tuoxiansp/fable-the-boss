# Worker reference: Codex CLI (`codex`)

Install: `brew install codex`. Auth: `codex login` (the user's step).

## Dispatch command

```
codex exec --json -C <workdir> --sandbox workspace-write \
  [-m <model>] -o /tmp/crew-<name>-last.txt [resume <session-id>] "<prompt>"
```

- Flags must come **before** the `resume` subcommand.
- **Honest mapping note**: codex has no auto-review tier in headless mode.
  Interactive codex has an approval channel (`--ask-for-approval`, and the desktop
  app's "approve for me"), but `codex exec` exposes none — escalations just fail
  back to the model. `workspace-write` is therefore a *rule-based approximation*:
  writes inside the workspace auto-run, everything else is blocked outright.
  Surface this to the user when it matters.
- Network is blocked by default — add `-c sandbox_workspace_write.network_access=true`
  when the task needs it.
- Child processes inherit the sandbox: GUI work (e.g. launching Chrome for tests)
  starts but crashes with error dialogs. Lanes that need GUI/process control don't
  fit the rules — ask the user whether to run that lane with
  `--dangerously-bypass-approvals-and-sandbox` (worktree remains the boundary) or
  report the step as unverified.
- `--json` streams JSONL events to stdout; `-o` writes the final message to a file —
  read that file on wake instead of parsing the stream.
- Long prompts: pass `-` and pipe via stdin.

## Sessions

- A session id only exists after the first run: register with `session: null`, then
  capture `thread_id` from the `thread.started` JSONL event and persist it.
- If a resume run warns "session was recorded with model X but is resuming with Y",
  persist X as the worker's model and use it from then on.

## Models

- No model-list command. Pass the model through with `-m` and surface errors; when
  unset, codex uses the default from `~/.codex/config.toml`.

## Behavior notes

- Read-only tasks can be enforced with `--sandbox read-only`.
- Headless turns open with one short `agent_message`, then work silently through
  tool-call items; `item.completed` events are the progress signal.
