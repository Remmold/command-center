# 01: Fake Claude CLI that replays scripted conversations

**What to build:** a stand-in `claude` the app can launch, speaking stream-json and the control protocol, that replays scripted conversations and logs everything it receives. The app uses it when `CC_CLAUDE_BIN` is set.

**Blocked by:** None (can start immediately)

**Status:** in-progress

- [ ] `tools/fake-claude/` — a dependency-free Node program accepting the app's flags (`--input-format stream-json --output-format stream-json --verbose --permission-prompt-tool=stdio --setting-sources … --include-partial-messages --resume --permission-mode --model --effort --allow-dangerously-skip-permissions`), ignoring unknown ones
- [ ] Answers control requests with recorded shapes from `src/main/claude/fixtures/`: `initialize` (models, account, commands, current_permission_mode), `get_usage`, `set_permission_mode`, `apply_flag_settings`, `set_model`, `set_max_thinking_tokens`, `get_settings`, `interrupt` (ends a running turn with the real interrupted result shape)
- [ ] Scripts: a JSON file (path via `FAKE_CLAUDE_SCRIPT`) with ordered turns — a regex on the user text, then events: `system/init`, text deltas, assistant messages, `tool_use` with an awaited outgoing `can_use_tool` control request (continues on allow, emits the deny path on deny), `tool_result`, `rate_limit_event`, `result`; optional per-event delays for slow streaming. A default script answers any prompt with a short reply
- [ ] Logs every received line (user messages, control requests and responses) and its argv as JSON lines to `FAKE_CLAUDE_LOG`
- [ ] `locateClaude` returns the fake when `CC_CLAUDE_BIN` is set (path to the fake's entry, run with the current Node/Electron-as-node), otherwise unchanged
- [ ] Tests: script matching, each control reply, the approval round-trip (allow and deny), interrupt mid-stream, the log
- [ ] Two ready scripts in `tools/fake-claude/scripts/`: `basic.json` (one reply) and `approval.json` (a Write tool call that needs approval, then a reply)
