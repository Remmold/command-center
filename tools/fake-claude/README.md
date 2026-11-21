# fake-claude

A stand-in `claude` for tests. It speaks stream-json and the control protocol, replays a scripted conversation and logs what it receives. It costs no tokens and needs no login.

Every line it writes is cloned from a recording of the real CLI in `src/main/claude/fixtures/`: `initialize-reply.json`, `get-usage-reply.json`, `error-reply.json`, `control-replies.jsonl` (control-only probe), `turn-write-approval.jsonl` (one real Haiku turn with a Write approval) and `turn-queued-message.jsonl` (the queue frames of a prompt sent during a real Haiku turn). The one exception is the interrupted result, built from the CLI's own result schema because no real interrupt mid-turn was recorded.

## Running it in the app

Set `CC_CLAUDE_BIN` to the path of `fake-claude.mjs`. `locateClaude` then runs it with the app's own binary (`process.execPath`) and `ELECTRON_RUN_AS_NODE=1`, for hosted sessions and the usage check alike. Normal use never sets it. A relative path resolves against the app's working directory.

With `CC_CLAUDE_BIN` set, the app's Default profile reads `CLAUDE_CONFIG_DIR` instead of `~/.claude`. Point it at a temp folder holding an empty `.credentials.json` so the usage check runs.

| Variable | Meaning |
| --- | --- |
| `CC_CLAUDE_BIN` | path to `fake-claude.mjs` (read by the app) |
| `FAKE_CLAUDE_SCRIPT` | path to a script; without it every prompt gets "Hello from the fake Claude." |
| `FAKE_CLAUDE_LOG` | file the fake appends JSON lines to |

## Log

One JSON object per line, each with `t` (ISO time) and `kind`:
- `argv`: `argv`, `cwd`, `configDir` (its `CLAUDE_CONFIG_DIR` or null). One per process start.
- `received`: `line`, each parsed stdin line (user messages, control requests, control responses), or `raw` when it was not JSON.
- `sent`: `line`, each `control_request` (`can_use_tool`) and `control_cancel_request` the fake sent.

## Scripts

```json
{
  "turns": [
    {
      "match": "write|create",
      "flags": "i",
      "repeat": false,
      "deltaDelayMs": 0,
      "events": [
        { "type": "text", "text": "I'll create it." },
        {
          "type": "tool_use",
          "name": "Write",
          "input": { "file_path": "{cwd}{sep}hello.txt", "content": "hi" },
          "result": "File created successfully at: {cwd}{sep}hello.txt",
          "onDeny": [{ "type": "text", "text": "Okay, I won't." }]
        },
        { "type": "rate_limit_event", "utilization": 0.5 },
        { "type": "text", "text": "Done.", "delayMs": 500 }
      ]
    }
  ]
}
```

- Each user message plays the first turn whose `match` regex (with `flags`) matches its text and has not been played yet; `repeat: true` lets a turn play again. With no match the default reply plays.
- Every turn starts with `system/init`, and each message with a `status: requesting` line. A turn without a `result` event ends with a success result carrying the last text.
- Events (all take an optional `delayMs` before them):
  - `text`: one assistant message, streamed in 3-word deltas (or `deltas: [...]`), `deltaDelayMs` between them (event or turn level).
  - `tool_use`: a tool call. Unless `approval: false`, the permission mode allows it, or an earlier "allow" saved a matching rule or mode, it sends `can_use_tool` and waits. Allow → `tool_result` with `result` (default "Done."). Deny → error `tool_result` with the deny message, then `onDeny` events (and a success result) if given, else the remaining events. Deny with `interrupt: true` ends the turn as interrupted. `suggestions` overrides `permission_suggestions` (default for edit tools: the recorded "accept edits this session").
  - `rate_limit_event`: the recorded event; `utilization` (0–1) overrides each window.
  - `result`: ends the turn; `text` overrides the result text, `error: true` sends the interrupted result.
  - `wait`: pauses `ms`.
  - `raw`: writes `line` as given.
- `{cwd}` and `{sep}` in any string become the fake's working directory and path separator.
- A user message with a `uuid` gets the CLI's `command_lifecycle` frames: `queued` on arrival, `started` when its turn begins, then `completed` (or `cancelled` when interrupted) after the result. With `--replay-user-messages` the prompt is echoed back as a `user` line with `isReplay: true` once it starts.
- A message sent during a turn waits in the queue. If the turn then finishes a tool call, the message joins that turn after the tool result (replay, `started`), its matching turn's events play before the one result, and its `completed` comes before that result, as in the recording. Otherwise it starts its own turn after the result, also after an interrupt.
- `interrupt` stops the running turn: a pending approval gets a `control_cancel_request`, then "[Request interrupted by user]" (or "… for tool use") and an `error_during_execution` result.

Ready scripts: `scripts/basic.json` (one reply per prompt) and `scripts/approval.json` (a Write that needs approval, then a reply).
