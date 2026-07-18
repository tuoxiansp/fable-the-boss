# codex provider

Observes a codex worker two ways, in order:

1. `worker.activeTask.outputFile` — the JSONL event stream of a dispatch in flight.
2. Fallback: the session rollout file under `~/.codex/sessions/**` matching
   `worker.session` — works even when the session is being driven from somewhere
   else (interactive TUI, another orchestrator).

Phase: `done` when a terminal event (`turn.completed`) is seen on an active task;
`working` when the stream was written to in the last two minutes; otherwise `idle`.
