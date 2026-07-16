# Worker reference: Codex CLI (`codex`)

Install: `brew install codex`. Auth: `codex login` (the user's step).

## Dispatch command

```
codex exec --json -C <workdir> --sandbox workspace-write \
  [-m <model>] -o /tmp/crew-<name>-last.txt [resume <session-id>] "<prompt>"
```

- Flags must come **before** the `resume` subcommand.
- `workspace-write` auto-runs writes inside the workspace and blocks the rest.
  Network is blocked by default — add `-c sandbox_workspace_write.network_access=true`
  when the task needs it. Known rough edge: heavy test runners doing process
  control (e.g. Playwright killing a browser) can hit `EPERM`; have the worker
  report it as unverified rather than fight the sandbox.
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
