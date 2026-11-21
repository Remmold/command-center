# VS Code parity: model, effort, modes, approvals and usage work like the extension

Status: ready-for-agent

## Problem Statement

Andreas wants to work only in the command center, and he and most Claude Code users know the VS Code extension's way of working. The app differs from it where it matters every minute:
- The model is fixed when a session starts.
- There is no effort or thinking control.
- The permission mode is fixed at spawn, behind an app-specific picker.
- Approvals run through a hook and a localhost server, with an Allow/Deny prompt that isn't the extension's.
- Stop sends a signal.
- The usage strip shows a bar only for accounts that have run a session today, unlabelled.

## Solution

Copy the extension exactly. The findings, with evidence, are in `docs/research/vscode-extension-controls.md`, and the CLI behaviour was confirmed by a probe on 2026-11-21. The app spawns the CLI once per chat the way the extension does, and changes model, effort, thinking and permission mode live through stdin control requests, with no restart. Approvals arrive as `can_use_tool` control requests and get the extension's numbered prompt. Stop sends `interrupt`. On top of the extension, the app keeps its multi-account profiles. Top right, the strip shows every account (labelled with its email and plan) with live 5-hour and weekly usage, fetched by `get_usage` even when no chat is running on that account.

## User Stories

1. As Andreas, I want a model pill in the prompt box footer showing the model and effort ("Opus 5.5 · High"), so that I see what I'm talking to, as in VS Code.
2. As Andreas, I want clicking the pill to list the models the CLI offers (from its startup handshake, e.g. Default (recommended), Opus 5.5, Sonnet 5.5, Haiku 5.5, Fable 5.1 and older ids), with the effort levels each supports (Low / Medium / High / Extra high / Max), so that I choose exactly as in VS Code.
3. As Andreas, I want a model or effort change to apply to the running chat immediately, without losing the conversation, so that switching is instant.
4. As Andreas, I want the model and effort I pick to become the default for new sessions, stored where the extension stores it (user `settings.json`), so that VS Code and the command center agree.
5. As Andreas, I want a Thinking toggle like the extension's, so that I can turn extended thinking on or off for the chat.
6. As Andreas, I want the permission mode picker on the right of the prompt footer with the extension's labels (Manual, Edit automatically, Plan, Auto, Bypass permissions), and Shift+Tab to cycle through them in the extension's order, so that my muscle memory works.
7. As Andreas, I want a mode change to apply live to the running chat, so that I can drop into Plan mode mid-conversation.
8. As Andreas, I want approvals to look like the extension's, so that approving feels identical:
   - the tool and its full input;
   - numbered choices: **1 Yes**, **2 Yes, allow … for this session / this project (just you) / this project (shared) / all projects** (as offered by the CLI's suggestions), **3 No**;
   - a "Tell Claude what to do instead" box;
   - the keys 1/2/3 and Esc.
9. As Andreas, I want "allow for …" choices to save the rule where the extension saves it (via the response's `updatedPermissions`), so that a rule set here also applies in VS Code.
10. As Andreas, I want Stop (button and Esc while running) to interrupt the turn like the extension, without killing the process.
11. As Andreas, I want the top-right strip to show **every account profile**, each labelled with its account email (or name) and plan, with two small bars for the 5-hour session window and the weekly window, so that I can see all my licences at once.
12. As Andreas, I want those numbers fetched even when no chat runs on that account, refreshed every 5 minutes and right after any turn ends, so that they are current.
13. As Andreas, I want clicking an account in the strip to open an Account & usage popover like the extension's ("Session (5hr)" and "Weekly (7 day)" bars with % used and reset time, plus email, organization and plan), so that I see the detail.
14. As Andreas, I want a profile that isn't logged in to show "not logged in" with a Log in button, so that a broken account is obvious.
15. As Andreas, I want the chat header's account dropdown to move the workspace to another profile. The extension has no such control because it uses one account; this one change needs a restart with `--resume`, since the account is the process's login.
16. As Andreas, I want the Work list rows to show a small `model · effort` tag, so that I can tell sessions apart.

## Implementation Decisions

- **Spawn like the extension.**
  - Flags: `--input-format stream-json --output-format stream-json --verbose --permission-prompt-tool=stdio --setting-sources user,project,local --include-partial-messages [--resume <id>] [--permission-mode <mode>]`.
  - Pass `--model` or `--effort` only when the session has an explicit choice that differs from the user default.
  - Once approvals run over stdio, drop `--settings` with the hook, the PreToolUse hook script and the localhost permission server. Keep the legacy hook cleanup on start.
  - Don't pass `--replay-user-messages` unless the chat needs it; the app already renders the user's own messages.
- **Control channel** in the main process, per session:
  - Write `{"type":"control_request","request_id":<uuid>,"request":{"subtype":…}}` lines.
  - Match `{"type":"control_response","response":{"subtype":"success"|"error","request_id",…}}`, and time out after 20 s.
  - Requests used:
    - `initialize`, right after spawn; store `models`, `account`, `commands` and `current_permission_mode`.
    - `apply_flag_settings` `{settings:{model, effortLevel}}` (or `set_model`).
    - `set_max_thinking_tokens` `{max_thinking_tokens: 31999|0}`; confirm the field name from the research doc.
    - `set_permission_mode` `{mode}`.
    - `interrupt`.
    - `get_usage`.
- **Incoming control requests** from the CLI:
  - `can_use_tool` (tool name, input, permission suggestions, tool use id) goes to the approval prompt.
  - The reply is a `control_response` success whose `response` is `{behavior:"allow", updatedInput, updatedPermissions?}` or `{behavior:"deny", message, interrupt?}`.
  - The exact envelope is in the research doc; verify it with a real run.
- **Defaults**: like the extension, a model or effort pick is written to the user `settings.json` keys `model` and `effortLevel`. For the Default profile that's `~/.claude/settings.json`; other profiles share it through their link. Thinking defaults to on (31999).
- **Usage service** (main process):
  - Per profile, a short-lived CLI process sends `initialize` + `get_usage` and exits. Non-default profiles get their `CLAUDE_CONFIG_DIR`.
  - It runs every 5 minutes and after each turn's `result`, and never sends a prompt.
  - Running sessions' `rate_limit_event`s update the numbers in between.
  - Profile usage = `{account: {email, organization, subscriptionType}, fiveHour?: {utilization, resetsAt}, sevenDay?: {utilization, resetsAt}, error?}`.
- **UI**:
  - The model pill, Thinking toggle and mode picker sit in the prompt box footer, as in the extension.
  - The chat header keeps the title, account dropdown, IDE/shell toggles and menu.
  - Labels match the extension word for word (research doc sections 3–5).

## Testing Decisions

- **Seam: the control channel.** Pure framing and matching: request lines, response matching by id, timeouts, and routing of incoming `can_use_tool`. Tested with recorded lines from the probe and the research doc.
- **Seam: pure mappers.**
  - models list → picker options (effort levels per model, "Default (recommended)");
  - mode cycle order for Shift+Tab;
  - approval choices from permission suggestions → buttons and the reply payload;
  - `get_usage` → usage rows, with null windows hidden;
  - pill text.
- Each ticket gets a real-CLI check in a temp workspace: no prompts where possible, a trivial "say hi" otherwise.
- Lane 2: side by side with the VS Code extension for look and feel.

## Out of Scope

- Remote/cloud sessions, rewind/checkpoints, prompt suggestions, Chrome/browser tools, fast mode.
- Changing how sessions are listed or the Dashboard beyond the usage strip.

## Further Notes

- Supersedes views-redesign ticket 08 (restart-based switching), which is withdrawn.
