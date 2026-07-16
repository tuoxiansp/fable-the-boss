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

- Mint a session id upfront with `cursor-agent create-chat`; it stays fixed for the
  worker's lifetime and every dispatch resumes it with `--resume <chat-id>`.

## Models

- Enumerable: validate any requested model against `cursor-agent models`.

## Behavior notes

- Read-only tasks can be enforced at the harness level with `--mode ask`
  (or `--mode plan` for read-only planning).
