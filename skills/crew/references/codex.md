# Worker reference: Codex CLI (`codex`)

Install: `brew install codex`. Auth: `codex login` (the user's step).

## Dispatch command

```
codex exec --json -C <workdir> --dangerously-bypass-approvals-and-sandbox \
  [-m <model>] -o /tmp/crew-<name>-last.txt [resume <session-id>] "<prompt>"
```

- Flags must come **before** the `resume` subcommand.
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

- Read-only tasks are contractual only — no enforcing flag when running unsandboxed;
  verify with `git status` on wake.
- Headless turns open with one short `agent_message`, then work silently through
  tool-call items; `item.completed` events are the progress signal.
