# Worker reference: Cursor Agent (`cursor-agent`)

Install: `curl https://cursor.com/install -fsS | bash`. Auth: `cursor-agent login`
(the user's step).

## Dispatch command

```
cursor-agent -p --output-format json --resume <chat-id> \
  [--model <model>] --workspace <workdir> --trust --auto-review "<prompt>"
```

- `-p` (print) is headless mode; `--trust` skips the interactive workspace-trust
  prompt; `--auto-review` auto-runs tool calls a server classifier deems safe and
  holds the rest — the worker should report anything held (`NEED_ADVICE:`) instead
  of stalling.

## Sessions

- Do **not** use `cursor-agent create-chat` — it hangs indefinitely in headless
  contexts. Register with `session: null`, run the first dispatch without
  `--resume`, and capture `session_id` from the result JSON; resume with it from
  then on.

## Models

- Enumerable: validate any requested model against `cursor-agent models` — exact
  ids only (e.g. `cursor-grok-4.5-high-fast`, not "grok 4.5 high fast").

## Behavior notes

- Read-only tasks can be enforced at the harness level with `--mode ask`
  (or `--mode plan` for read-only planning).
