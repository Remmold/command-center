# 01: Chat drawer opens a session's chat on the Dashboard

**What to build:** clicking a Needs you row or a hosted Live session card on the Dashboard opens that session's chat in a **chat drawer** docked on the Dashboard's right, with the Dashboard's panels reflowing narrower beside it (spec: `.scratch/dashboard-drawer/spec.md`, ADR 0004). A reply sent from the drawer is a reply sent from Work. The drawer can be resized, closed, and left for Work through "Open in Work".

Rules (from the spec, word for word):
- **The drawer borrows Work's chat** (ADR 0004). Every hosted chat stays mounted inside Work and owns its process. While the Dashboard shows a drawer session, that session's mounted chat is positioned over the drawer's chat area and kept visible, while the rest of Work stays invisible. No second chat is mounted; process start and stop are untouched. Switching to Work returns the chat to its half, if it has one.
- **Drawer state is a new small store** holding the drawer's session (pane id or none) and its width share. The share is persisted, the session is not (not restored after a restart). Default share 0.4, minimum width 420 px, maximum 80 % (the Board's ticket drawer's numbers and the existing Drawer component's cap).
- **Opening in the drawer is a new navigation function** beside opening a session in Work. It sets the drawer's session and asks the chat to take focus (the existing focus request, so a pending approval prompt gets focus first). It does not touch Work's chat pair, the active workspace or the active session.
- **Clicks:** Needs you rows and hosted Live session cards open in the drawer. Observed Live cards and Now building rows are unchanged.
- **Drawer header:** repo icon, worktree tag, session title, account tag, status, an "Open in Work" button and a close button. No Agents, Processes, Media or Test tabs and no IDE panels.
- **"Open in Work"** opens the session in Work's focused half (the existing open-in-Work behaviour) and closes the drawer.
- **Close:** the close button and Esc (unless an overlay, menu or dialog is open, as the existing Drawer component already checks). The drawer also closes when its session no longer exists among the hosted sessions.
- **Highlight:** the drawer's session row in Needs you and its Live card show a selected state.
- **Layout:** the Dashboard becomes the main region of a drawer host, so its panels reflow narrower beside the drawer, as the Board does with its ticket drawer.
- The Needs you row's "Open in approvals" button keeps opening the approval inbox. The approval inbox's own "open chat" action keeps opening Work from every view.
- The drawer's session survives leaving the Dashboard for the Board, Context or Work and coming back; after an app restart the Dashboard opens with the drawer closed.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Unit tests (seam 1) for the drawer state: open, swap to another session, close, closes when the session no longer exists among the hosted sessions, opening leaves Work's chat pair, active workspace and active session untouched, width share default 0.4 and clamped between 420 px and 80 %, share persisted and session not. Prior art: the dashboard, session-list and chat pair state tests.
- [ ] New UI scenario (seam 2) in a new dashboard spec file on the fake CLI: on the Dashboard, a waiting session's Needs you row opens its chat in the drawer; a reply sent there reaches the fake CLI and the view is still the Dashboard; "Open in Work" lands on it in Work. The suite goes from 12 to 13 of its 20 scenarios (counted by the budget counter) and must stay within 200 s.
- [ ] Every hosted chat's layer in Work changes here, so the whole UI suite (`pnpm e2e`) runs once and is green before the commit, not only the new scenario.
- [ ] Quick tier green.
