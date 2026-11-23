# 01: The current chat shows, unmistakably, which subscription it runs on

**What to build:** Andreas likes the per-account usage bars at the top right. He wants "a more focused one for just the one in the current tab … ultra clear and accurate which sub is used for the current session". His screenshot (0.1.5, two accounts) is `C:\Users\remmold\AppData\Local\Temp\claude\c85b1d19935b6b03\94ac3789-dfed-4f49-9914-b5b495f3362a\scratchpad\parity-shots\account-header.png`; read it first.

**Blocked by:** None (can start immediately)

**Status:** resolved

**Accuracy rule:** the badge shows the account the chat's Claude process actually runs on, never the workspace's current setting.
- **Hosted chats:** use the account the CLI reported in its `initialize` reply (email, organisation, subscription type) for that pane's process. Before that reply arrives, use the `CLAUDE_CONFIG_DIR` profile the process was started with, marked as pending, never guessed from the workspace.
- **Chats live in VS Code** (the read-only view and Take over): find the config folder whose `sessions/<pid>.json` holds this session id. That's how take-over already reads live status (`src/main/observed/turn.ts`). Map that folder to the app's account. If no live process file exists, fall back to VS Code's folder→profile association (`vscodeMatch`) and label it "probably". If neither works, show "unknown account" instead of guessing.

Requirements:
- [x] **Chat header badge:** next to the title in the chat header (hosted and VS Code views, both halves of a split), a clear account badge shows:
  - the account name and plan ("Work · Claude Team", or the email when the name is the default);
  - the account's own usage bar, the same 5-hour/weekly data as the top-right pill;
  - a distinct accent per account, used consistently.

  It replaces today's small grey email chip. Hover shows the full email, organisation, the config folder and where the information came from ("reported by Claude", "from the running VS Code session", "probably: VS Code profile Work").
- [x] **Top-right link:** the pill for the focused chat's account is highlighted (ring and full opacity), and the other accounts' pills are dimmed. With no chat focused, all show normally.
- [x] **Account colours:** each account gets a stable accent colour from a small palette, chosen in Settings → Accounts (default by order). The same colour shows on the header badge, the top-right pill, the account section headers in the Work list and the Dashboard account tags.
- [x] **Mismatch warning:** if a hosted chat runs on an account other than the one its workspace is now set to, the badge shows a warning: "Running on Personal; this workspace is set to Work". It has a **Restart on Work** action that resumes the same session (`--resume`) on the workspace's account. Only offer it when the chat is idle.
- [x] **New chats:** the account picked at start (workspace account) shows in the badge at once as pending, and is confirmed by `initialize`.
- [x] **Pace bar (added 2026-11-23):** under each usage bar with a reset time (weekly and 5-hour), a thin second bar shows how much of the current window has passed (elapsed = 1 − time left / window length; 7 days, 5 hours), the same width so the two line up. Usage at or below elapsed reads "on track"; above it reads "ahead of pace by N%" in the warning colour. The tooltip gives both numbers and the reset ("62% used · 48% of the week passed · resets Mon 23:59"). Shown in the top-right pill and popover and in the chat-header badge; a 2px line under the usage bar in the pill. Updates at most once a minute and when usage refreshes. Pure model and tests: elapsed fraction (clamped before/after the window, no bar without a reset time) and the pace verdict.
- [x] **Usage under the Work list's account headers (added 2026-11-23):** with two or more accounts, each account section header in the Work session list carries that account's compact usage: a line per window ("5h 34% · on track · resets 14:20", "Week 62% · ahead by 14% · resets Mon 23:59") with its bar and the thin time-passed line, in the account's colour. It shows when the section is folded too; the Needs-you count stays. Nothing shows when the account has no usage data. Fits the list at 300px and at 150% zoom; covered by the two-account e2e.
- [x] **Tests:**
  - pure: account resolution for hosted chats (initialize vs start profile), for VS Code chats (live `sessions/<pid>.json` match, association fallback, unknown), and mismatch detection;
  - e2e on the fake CLI with two profiles:
    - a chat in a Work workspace shows the Work badge and the Work pill highlighted;
    - moving the workspace to Personal shows the mismatch warning;
    - Restart on Work resumes on the Work config dir (check the fake's logged env).
  - The perf guard and zoom overflow checks stay green; the badge must fit at 150% in a split view.
