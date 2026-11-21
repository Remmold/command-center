# Test harness: a fake Claude CLI and an Electron UI smoke suite

Status: ready-for-agent

## Problem Statement

Every check against the real `claude` CLI spends Andreas's tokens and needs his login. Agents had to copy credentials into temp homes for clean permission tests, which risks rotating his real login. Nothing tests the app's UI end to end, so a change can silently break starting a chat, approving a tool or switching views.

## Solution

A **fake CLI**: a small Node program the app can launch in place of `claude`. It speaks the same stream-json protocol, including the control requests (`initialize`, `get_usage`, `set_permission_mode`, `apply_flag_settings`, `set_max_thinking_tokens`, `interrupt`, and outgoing `can_use_tool`). It replays scripted conversations recorded from the real CLI.

On top of it, a **Playwright-for-Electron smoke suite** drives the built app: open it, start a session, see a streamed reply, approve and deny a tool, switch model and mode, stop a turn, switch views. It uses zero tokens and needs no login.

## User Stories

1. As Andreas, I want the app's tests to run without my tokens or my login, so that overnight testing is free and safe.
2. As Andreas, I want a smoke suite that opens the real app and walks through daily actions, so that a change can't silently break them.
3. As an agent, I want to script a fake conversation (prompt pattern → stream of events, optional tool call needing approval, optional slow streaming), so that I can reproduce a bug without the real CLI.
4. As an agent, I want the fake to record what it received (control requests, user messages, flags), so that tests can assert what the app sent.

## Implementation Decisions

- **Fake CLI:** `tools/fake-claude/` (Node, no dependencies).
  - It accepts the same flags the app passes and ignores the ones it doesn't need. It answers control requests with recorded shapes (`src/main/claude/fixtures/`).
  - Scripts are JSON files: an ordered list of turns. Each turn has a match on the user text, an event list (text deltas, tool_use, an awaited `can_use_tool` request, tool_result, result) and delays.
  - It writes a log of everything it received to a file named by an env var.
- **Wiring:** the app uses the fake when `CC_CLAUDE_BIN` points at it, via `locateClaude`. Tests set it; normal use never does.
- **Smoke suite:** `pnpm e2e` runs Playwright's Electron support against the built app.
  - Each test gets a temp `--user-data-dir` and a temp workspace, with the fake CLI and a temp `CLAUDE_CONFIG_DIR`.
  - It is not part of the quick tier, because it is slow. Ship mode runs it.
- Scenarios:
  - start a session and see the reply;
  - approve with 1 and deny with 3 plus feedback (the fake logs the reply payload);
  - "allow for this session";
  - Shift+Tab mode change (the fake logs `set_permission_mode`);
  - model/effort change (the fake logs `apply_flag_settings`);
  - Stop (the fake logs `interrupt`);
  - Dashboard / Work / Board switching;
  - the usage strip from the fake's `get_usage`.

## Testing Decisions

- The fake has its own unit tests: script matching, and control-request replies.
- The smoke suite is the high-level seam for the app. It asserts on what the user sees and on the fake's log of what the app sent, never on internals.

## Out of Scope

- Visual regression and pixel diffs.
- Tests against the real CLI in CI.
