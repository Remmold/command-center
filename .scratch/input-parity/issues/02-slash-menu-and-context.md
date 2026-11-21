# 02: Full slash menu and the context-usage indicator

**What to build:** the slash menu matches the extension's. It lists the CLI's commands with descriptions and argument hints. Enter sends `/name`, Tab inserts `/name ` with a ghost hint, and /model, /usage and /context open the app's own picker and dialogs. A context-usage indicator appears from 50% full; clicking it sends `/compact`. Evidence is in `docs/research/vscode-extension-input.md` sections 1 and 6.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] The menu lists commands from the session's `initialize` reply (`commands`: name, description, argumentHint) plus any the extension adds locally, in the extension's order, filtered as you type; ↑/↓, Tab, Enter, Esc as the extension
- [ ] Enter on a command sends `/name` as user text; Tab inserts `/name ` and shows the argument hint as ghost text
- [ ] /model opens the model pill's menu; /usage opens the Account & usage popover; /context opens a context dialog showing `get_context_usage` data the way the extension does (per research doc)
- [ ] Context indicator in the prompt footer: hidden below 50%, a small pie from 50% (thresholds and look per the extension), tooltip with the numbers; click sends `/compact`; refreshed with `get_context_usage` after each turn
- [ ] Tests: pure slash-menu model (filter, order, Tab/Enter results), indicator thresholds; smoke scenario on the fake CLI (extend the fake's `initialize` commands and `get_context_usage` reply from a real control-only recording)
