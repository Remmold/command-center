# 01: Type during a turn, prompt history, and the extension's keys

**What to build:** the prompt box stays editable while Claude works. A message sent mid-turn goes to the CLI at once and shows as a queued bubble. ↑/↓ recall this session's earlier prompts. Esc stops Claude from anywhere in the chat, and Ctrl+J adds a newline. All of it matches `docs/research/vscode-extension-input.md` sections 4 and 6.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] The input is editable during a turn; Send during a turn writes the message to the CLI's stdin immediately and shows it as a queued bubble until the CLI starts it (wording/look per the research doc); Stop replaces Send only while the input is empty
- [x] ↑ with the caret at the start (and ↓ at the end) steps through this session's earlier prompts, as the extension does; editing a recalled prompt doesn't change history
- [x] Esc stops the running turn from anywhere in the chat area (not only when the input has focus), unless a menu/popover/approval prompt is open (those close first)
- [x] Ctrl+J inserts a newline in the prompt box (extension behaviour); the app's "next waiting session" moves from Ctrl+J to **Ctrl+Shift+J** everywhere (shortcut map, tooltips, README, test page)
- [x] Enter/Shift+Enter follow the extension's default and its setting (per research doc section 4), exposed in Settings → General if the extension exposes it
- [x] Tests: pure history navigation and queued-message state; the shortcut map (no clashes); Electron smoke scenario on the fake CLI: send mid-turn shows a queued bubble and the fake logs the second user message during the turn
