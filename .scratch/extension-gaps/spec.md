# Extension gaps: existing account folders, subagent view, Remote Control

Andreas asked (2026-11-22) to close the three gaps left between Command Center and the VS Code extension.

## Why

- **Accounts.** His VS Code profile "Work" points the extension at `C:\Users\remmold\.claude-work` through `claudeCode.environmentVariables` → `CLAUDE_CONFIG_DIR`. That folder holds the work login. Its `projects`, `plugins` and `hooks` are junctions back to `~/.claude`. Command Center can only create fresh profile folders under its user data, so using the work account here means logging in again.
- **Subagents.** Messages from subagents (`parent_tool_use_id` set) are mixed flat into the main chat. The extension groups them under the Agent tool call, shows status, lets you stop one and open its transcript (`stop_subagent`, `get_subagent_transcript`, `get_task_output` in the webview bundle).
- **Remote Control.** The extension toggles Remote Control per session by sending the running CLI a `remote_control` control request. The reply carries `session_url` and `connect_url`. Command Center has no toggle.

## Rules for all three

- Mimic the extension exactly: wording, placement, keys, states. Evidence comes from the bundle at `C:\Users\remmold\.vscode\extensions\anthropic.claude-code-2.1.330-win32-x64\`. Write what you find into `docs/research/vscode-extension-controls.md`.
- Never modify, move or delete a folder the app did not create. `.claude-work` and `~/.claude` are read-only to the app, except what the CLI itself writes.
- Tests on the fake CLI, with zero real prompts. Ticket 03 may make control-only probes on the real CLI in a temp workspace, and must turn Remote Control off again afterwards.

## Seams

- 01: a pure "profile from an existing folder" model (validation, logged-in detection, delete-safety) plus a pure reader of VS Code profiles' `CLAUDE_CONFIG_DIR`.
- 02: a pure grouping of a transcript's items into a parent call and its subagent items, with status.
- 03: a pure Remote Control state machine (off, connecting, connected, error) driven by control replies.
