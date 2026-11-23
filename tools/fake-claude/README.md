# fake-claude

A stand-in `claude` for tests. It speaks stream-json and the control protocol, replays a scripted conversation and logs what it receives. It costs no tokens and needs no login.

Every line it writes is cloned from a recording of the real CLI in `src/main/claude/fixtures/`: `initialize-reply.json`, `get-usage-reply.json`, `get-context-usage-reply.json` (control-only probe; personal paths and MCP/skill names replaced), `error-reply.json`, `control-replies.jsonl` (control-only probe), `turn-write-approval.jsonl` (one real Haiku turn with a Write approval), `turn-thinking.jsonl` (a real Haiku turn with thinking on; init line dropped, MCP name replaced) `turn-queued-message.jsonl` (the queue frames of a prompt sent during a real Haiku turn) and `remote-control-replies.jsonl` (control-only probe turning Remote Control on and off; session ids replaced). The one exception is the interrupted result, built from the CLI's own result schema because no real interrupt mid-turn was recorded.

## Running it in the app

Set `CC_CLAUDE_BIN` to the path of `fake-claude.mjs`. `locateClaude` then runs it with the app's own binary (`process.execPath`) and `ELECTRON_RUN_AS_NODE=1`, for hosted sessions and the usage check alike. Normal use never sets it. A relative path resolves against the app's working directory.

With `CC_CLAUDE_BIN` set, the app's Default profile reads `CLAUDE_CONFIG_DIR` instead of `~/.claude`, and passes it on to the CLI processes it starts for Default. Point it at a temp folder holding an empty `.credentials.json` so the usage check runs.

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
  - `thinking` (on a `text` or `tool_use` event): a thinking block streamed first in the same message, as the real CLI does: `thinking_tokens` estimates, `thinking_delta`s and a `signature_delta`. `true` or `{ "ms": 1200, "tokens": 258, "text": "…" }`; the text defaults to empty, as Haiku sends it.
  - `tool_use`: a tool call. TodoWrite runs without asking and gets the CLI's own result text. Unless `approval: false`, the permission mode allows it, or an earlier "allow" saved a matching rule or mode, it sends `can_use_tool` and waits. Allow → `tool_result` with `result` (default "Done."; an allowed `AskUserQuestion` gets the CLI's "Your questions have been answered: …" text built from the reply's `answers`, the wording the extension's transcript reader parses). Deny → error `tool_result` with the deny message, then `onDeny` events (and a success result) if given, else the remaining events. Deny with `interrupt: true` ends the turn as interrupted. `suggestions` overrides `permission_suggestions` (default for edit tools: the recorded "accept edits this session").
  - `runMs` (on a `tool_use` event): a shell command that runs that long in the foreground once allowed, built from the CLI's schema since none was recorded: `task_started` (`task_type: local_bash`, `is_backgrounded: false`), then `task_updated` `completed` and the call's result. `background_tasks` with its `tool_use_id` answers `{ backgrounded: true }`, sends `task_updated` `is_backgrounded: true` and the CLI's "Command was manually backgrounded by user with ID: …" result at once, and the turn goes on; any other id answers `{ backgrounded: false }`. An interrupt meanwhile gives the call an interrupted result.
  - `rate_limit_event`: the recorded event; `utilization` (0–1) overrides each window.
  - `result`: ends the turn; `text` overrides the result text, `error: true` sends the interrupted result.
  - `wait`: pauses `ms`.
  - `raw`: writes `line` as given.
  - `subagent`: an `Agent` call (`description`, `prompt`, `subagentType`) and its subagent's turn, built from the CLI's schema since no subagent turn was recorded. It sends `task_started` (`task_type: local_agent`), then its own `events` (put `approval: false` on tool calls), with `parent_tool_use_id` set to the call on every line, streamed lines included. A `task_progress` follows each event, then `task_notification` (`completed`, `summary` = `result`), then the call's result. With `background: true` the call's result ("Async agent launched…") comes right after `task_started`. With `CLAUDE_CONFIG_DIR` set, the subagent's own transcript goes to `projects/<cwd>/<session>/subagents/agent-<task id>.jsonl` with a `.meta.json` naming the call, as the CLI writes it. `stop_task` with its `task_id` stops it: `task_notification` `stopped`, an interrupted call result, and the turn goes on. Any other id gets an error. With `background: true` the agent outlives the turn instead: after the receipt the turn goes on at once while the agent plays its `events` (`text`, `tool_use` with `result`, `wait`; `loop` repeats them that many times) side by side with any other, each line sent with `parent_tool_use_id` and written to its own file, `task_progress` after each, then `task_notification` `completed` (or `stopped` after its `stop_task`), even after the turn's result.
- `generate_session_title` answers `{ title }`: a top-level `title` if the script has one, else the description's first five words, capitalised (after `titleDelayMs`, default 0). With `persist: true` the first title is kept, as the CLI keeps a persisted one; `rename_session` (`title`, optional `session_id`, which must be the current session) replaces it. No transcript is written.
- `remote_control` answers as the probe: on sends a `bridge_state` `ready` line and replies with `session_url`, `connect_url`, `environment_id`, `bridge_epoch`, `bridge_session_id` (a fake `https://claude.ai/code/session_01Fake…`; the same links while it stays on), off always succeeds. `initialize` reports `remote_control_auto_enable` as the top-level `remoteControlAtStartup` (default false, so chats don't start with it on) and `remote_control_available` as `remoteControlAvailable` (default true). A top-level `remoteControlError` makes turning it on fail with that message.
- `initialize` (for chats and the usage check alike) reports the account in `<CLAUDE_CONFIG_DIR>/fake-account.json` when that file exists, else the recorded one, so tests can give two profiles different accounts.
- A top-level `contextTokens` makes `get_context_usage` report that many tokens used (the difference moves between Messages and Free space). Without it the recorded reply comes back as is, with the current model.
- `{cwd}` and `{sep}` in any string become the fake's working directory and path separator.
- A user message with a `uuid` gets the CLI's `command_lifecycle` frames: `queued` on arrival, `started` when its turn begins, then `completed` (or `cancelled` when interrupted) after the result. With `--replay-user-messages` the prompt is echoed back as a `user` line with `isReplay: true` once it starts.
- A message sent during a turn waits in the queue. If the turn then finishes a tool call, the message joins that turn after the tool result (replay, `started`), its matching turn's events play before the one result, and its `completed` comes before that result, as in the recording. Otherwise it starts its own turn after the result, also after an interrupt.
- `interrupt` stops the running turn: a pending approval gets a `control_cancel_request`, then "[Request interrupted by user]" (or "… for tool use") and an `error_during_execution` result. As in the CLI's schema, its reply's `still_queued` lists the uuids of prompts still waiting, which then run; with `cancel_queued: true` they get `cancelled` instead and are listed in the reply's `cancelled`.

Ready scripts: `scripts/basic.json` (one reply per prompt) and `scripts/approval.json` (a Write that needs approval, then a reply; a prompt starting with "ask" gets an AskUserQuestion with a multi-select question and a single-choice one with previews). The UI suite (`e2e/*.spec.ts`) adds `e2e/scripts/slow.json`, `e2e/scripts/context.json` (700k tokens used, so the context pie shows) and `e2e/scripts/render.json` (thinking, two TodoWrite lists and a code block for "plan…"; a long two-part reply for "long…") and `e2e/scripts/look.json` (two MCP calls, thinking, a Read of a png and a file link for "render…"; its `compact_boundary` and synthetic summary lines are `raw`, built from the extension's reader since no compaction was recorded).
