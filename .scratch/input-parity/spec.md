# Input parity: the chat input, menus, rendering and history work like the VS Code extension

Status: ready-for-agent

## Problem Statement

The chat now talks to the CLI like the extension and approves the same way. But the input around it still differs in the places a daily user notices every minute. The full gap list, with evidence, is in `docs/research/vscode-extension-input.md`, ranked by daily impact:
- You can't type while Claude works.
- There is no ↑/↓ prompt history.
- The slash menu is thin.
- There is no context-usage indicator.
- Thinking, todo lists and copy buttons aren't shown.
- @-mentions are weak, and only images can be attached.
- Esc and newline keys differ from the extension.
- Scrolling jumps away while you read.

## Solution

Copy the extension exactly, gap by gap, in the research doc's priority order. Each ticket cites its section of `docs/research/vscode-extension-input.md` for wording, keys and behaviour.

## User Stories

1. As Andreas, I want to type and send while Claude works, with my message shown as a queued bubble and sent to the CLI at once, so that I can steer without waiting.
2. As Andreas, I want ↑/↓ to recall this session's earlier prompts when the caret is at the start or end, so that I can repeat or edit a prompt.
3. As Andreas, I want Esc to stop Claude from anywhere in the chat, and Ctrl+J to add a newline, as in the extension.
4. As Andreas, I want the slash menu to list the CLI's commands with descriptions and argument hints. Enter sends `/name`, and Tab inserts `/name ` with a ghost hint. /model, /usage and /context open the app's matching pickers and dialogs, as the extension does.
5. As Andreas, I want the context-usage indicator (a small pie from 50% full) that sends `/compact` when clicked, so that I see when a chat is getting full.
6. As Andreas, I want thinking blocks ("Thought for Ns", expandable), the TodoWrite checklist, copy buttons on code blocks and whole responses, and message timestamps, as in the extension.
7. As Andreas, I want the chat to stay where I am when I scroll up to read, and to follow new output only when I'm at the bottom.
8. As Andreas, I want @-mentions:
   - files and folders found with ripgrep, honouring .gitignore;
   - fuzzy ranking;
   - paths with spaces quoted;
   - `@terminal:`.
9. As Andreas, I want to attach PDF and text files as well as images, with the extension's limits.
10. As Andreas, I want session history like the extension's: CLI-generated titles, renames that reach the CLI, a status dot per entry, and search.

## Implementation Decisions

- **Ctrl+J** is a newline inside the prompt box, as in the extension. The app's "next waiting session" shortcut moves to **Ctrl+Shift+J**, and README, tests and test pages follow.
- Queued messages are written to the CLI's stdin straight away; the CLI queues them, as with the extension. The bubble shows "queued" until the CLI echoes or starts it. Stop replaces Send only while the input is empty.
- Slash commands go as user text unless the extension handles them locally (per the research doc); the locally handled ones open the app's own picker and dialogs.
- Context usage comes from the `get_context_usage` control request after each turn.
- Everything is tested on the fake CLI (`tools/fake-claude/`). Real-CLI checks: Haiku, one-line prompts, at most 3 per ticket, and never copy credentials.

## Testing Decisions

- Pure seams:
  - prompt-history navigation;
  - the slash menu model (filter, order, Tab and Enter results);
  - the context indicator thresholds;
  - the scroll-follow rule;
  - the mention ranker and quoting;
  - attachment validation;
  - the queued-message state.
- Electron smoke suite scenarios (`pnpm e2e`) added per ticket, on the fake CLI.

## Out of Scope

- Rewind (double-Esc) and checkpoints, remote sessions, and voice.

## Further Notes

- The research doc's UNCONFIRMED items are settled per ticket against the bundle, with each decision logged in `.scratch/overnight/decisions.md`.
