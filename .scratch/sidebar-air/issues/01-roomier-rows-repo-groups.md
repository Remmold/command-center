# 01: A sidebar with air, grouped by repo

**What to build:** Andreas (2026-11-24), on the 0.1.15 sidebar: "I would like some more air and easier to organize in the sidebar." He chose:
- **roomier rows**;
- **repo groups inside each account**.

```
⌄ ● Personal · Ultra          ▁▁▁▁▁▁▁▁ 0%

   ⌄ command-center
      [cc]  Command center kanban revamp

⌄ ● Work · Team               ████▁▁▁▁ 45%

   ⌄ continuum                              3
      [▶]  Organization multi invite      ●
      [▶]  Repository refactoring & sec…  ●
   ⌄ nordkastell
      [▶]  Customer review extraction     ●
```

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] **Roomier rows:**
  - Session rows about 36 px tall, up from about 26.
  - 12 px of space between account sections; 6 px above each repo group.
  - Repo icons a little larger (20 px).
  - Calmer status dots, smaller and softer.
  - Hover and selected states as today.
  - It must still fit at 300 px and 150% zoom (check with the zoom shots).
- [x] **Repo groups inside an account:**
  - Under each account header, chats are grouped by workspace (repo). Each group has a small sub-header: the repo icon, the repo name, and the chat count when folded.
  - Groups follow the Settings → Workspaces order. Inside a group, rows keep the compact sidebar order (needs you, then running, idle, VS Code).
  - A group with one chat still shows its header, for a consistent look.
  - Groups fold, and the folded state is remembered per account and repo.
  - A folded group with a waiting chat shows the amber "N waiting" pill, as account headers do.
- [x] **Keyboard:**
  - Ctrl+Shift+J opens a waiting chat even inside a folded group, unfolding it.
  - Alt+1..9 count only visible rows.
  - Search shows matching rows with their group headers and auto-unfolds groups that match.
- [x] **One account:** with a single account, the repo groups are the top level, with no account header.
- [x] **Tests:**
  - pure: the grouping, order, fold state, pill counts and Alt+N rows;
  - update existing UI assertions in `e2e/accounts.spec.ts` (sidebar structure). **No new scenario** (the suite is at 89.6 s of 90 s, so keep the runtime flat).
  - The zoom check gets the new list at 300 px and 150%; the perf guard stays green.
