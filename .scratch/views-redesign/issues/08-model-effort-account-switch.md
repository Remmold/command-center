# 08: Switch model, effort and account from the chat header

**What to build:** each hosted chat's header shows its model, effort and account as three small dropdowns. Changing any of them restarts that chat's Claude process on the same conversation, so history is kept. New sessions start with the model and effort used last. The Work list shows each session's model and effort as a small tag.

**Blocked by:** 07

**Status:** ready-for-agent

- [ ] **Model** dropdown: Opus, Sonnet, Haiku (the CLI aliases `opus`, `sonnet`, `haiku`), plus "Custom…" to type an exact model id. It shows the chat's current model.
- [ ] **Effort** dropdown: CLI default, low, medium, high, xhigh, max. "CLI default" passes no `--effort`; any other choice passes `--effort <level>`. It shows the chat's current effort. Each session stores `effort` next to `model`, persisted; existing sessions migrate to "CLI default".
- [ ] Changing model or effort on a chat with a running process: wait if a turn is in progress (the dropdown shows "applies after this turn"), otherwise stop the process and start it again with `--resume <its claude session id>` and the new flags. A chat without a process just stores the choice for its next start. The chat's items stay; a one-line note in the chat records the change ("Model → opus · effort → high").
- [ ] A new session (+ New session, Ctrl+T, "new … session here") starts with the last model and effort picked in any header (stored as defaults, persisted).
- [ ] **Account** dropdown in the header: the workspace's account profile, listing all profiles (with "not logged in" marked and disabled). Choosing one sets the workspace's profile (same as Settings → Workspaces) and restarts this chat on it with `--resume`, under the same in-progress rule. Other open chats in that workspace switch at their next restart; the dropdown says so in a hint.
- [ ] Work list rows show a small muted tag `model · effort` (e.g. `opus · high`, or just `sonnet` when effort is CLI default).
- [ ] Tests (pure): the launch arguments for model/effort (no `--effort` for CLI default; custom ids passed through); the restart decision (running + idle → restart now, running + mid-turn → after turn, no process → store only); defaults for new sessions; the effort migration; the row tag text.
