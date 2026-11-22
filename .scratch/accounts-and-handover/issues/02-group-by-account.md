# 02: Group projects by Claude account

**What to build:** projects and their chats are bundled by the Claude account (profile, i.e. subscription) their workspace uses, in four places: the Work session list, the Dashboard, the Board, and Settings → Workspaces. Each account shows by its name and plan, e.g. "Personal · Max" and "Work · Team", using the plan from the account's `initialize` / usage data.

**Blocked by:** None. Build after 01 or alongside it; both touch the Work list.

**Status:** resolved

Decided by Andreas (2026-11-22): all four places. In the Work list, account first, then status.

- [x] **Work list:**
  - Top level is one collapsible section per account, in the account order from Settings.
  - Inside each section: Needs you / Running / Idle / In VS Code, as today.
  - Each account header shows a "Needs you" count badge, so a waiting chat is never hidden inside a collapsed section.
  - Ctrl+Shift+J ("next waiting") and Alt+1..9 still work across sections, in the order shown.
- [x] **Dashboard:** Needs you, Now building and Live sessions each label rows with their account. Usage per account sits as before. A row's account is the account of its workspace. Prefer a small account tag on each row plus an order grouped by account, rather than splitting each section in two. Log the choice.
- [x] **Board:** a **By account** grouping option beside No grouping / By feature / By repo. A ticket's account is the account of its repo's workspace.
- [x] **Settings → Workspaces:**
  - workspaces are listed under their account;
  - they can be dragged to reorder within an account;
  - that order is used everywhere above;
  - changing a workspace's account moves it to that account's group.
- [x] **Unassigned workspaces:** a workspace using the Default profile shows under the default account's name, not under "Default".
- [x] **Tests:**
  - pure grouping and ordering models (Work list sections with badges, board grouping, ordering);
  - an e2e on the fake CLI with two profiles, checking that the sections and the By account grouping render.
