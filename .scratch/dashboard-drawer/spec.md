# Chat drawer on the Dashboard

**Status:** ready-for-agent

## Problem Statement

The Dashboard shows which sessions are waiting on Andreas across all his workspaces, but answering any of them throws him into Work. To answer the next one he has to go back to the Dashboard, find it, and get thrown into Work again. Working through several waiting sessions in different projects becomes a back-and-forth between two views instead of one pass down a list.

## Solution

Clicking a waiting or live hosted session on the Dashboard opens its chat in a **chat drawer** docked on the Dashboard's right. The Dashboard stays visible and usable beside it. Clicking another row swaps the drawer to that chat. Ctrl+Shift+J moves the drawer to the next waiting session. The drawer is the same chat Work shows (same process, draft and scroll), so a reply sent from the drawer is exactly a reply sent from Work. "Open in Work" moves on to Work when the full tools are needed.

## User Stories

1. As Andreas, I want to click a Needs you row and see that session's chat in a drawer beside the Dashboard, so that I can answer it without leaving the Dashboard.
2. As Andreas, I want to click a hosted Live session card and see its chat in the drawer, so that I can follow or steer a running session from the Dashboard.
3. As Andreas, I want clicking a different row while the drawer is open to swap the drawer to that session, so that I can move between projects in one place.
4. As Andreas, I want the drawer to keep showing a chat after I reply, so that I can watch it start running.
5. As Andreas, I want Ctrl+Shift+J on the Dashboard to swap the drawer to the next waiting session, so that I can work down the queue from the keyboard.
6. As Andreas, I want Ctrl+Shift+J to open the drawer on the first waiting session when the drawer is closed, so that the shortcut also starts the pass.
7. As Andreas, I want Ctrl+Shift+J to do nothing on the Dashboard when nothing is waiting, so that it never throws me into Work.
8. As Andreas, I want to answer tool approvals, questions and plans inside the drawer, so that a Needs approval session can be cleared from the Dashboard.
9. As Andreas, I want the drawer's chat to have its full input (slash menu, mentions, attachments, model and effort pickers), so that nothing I type behaves differently from Work.
10. As Andreas, I want a draft I start in the drawer to still be there when I open the same session in Work, and the other way round, so that the two never disagree.
11. As Andreas, I want the drawer header to show the session title, repo icon, worktree tag, account and status, so that I know which project I'm answering.
12. As Andreas, I want an "Open in Work" button in the drawer header, so that I can switch to Work's full tools for this session in one click.
13. As Andreas, I want "Open in Work" to put the session in Work's focused half and close the drawer, so that I land straight on it.
14. As Andreas, I want to close the drawer with its close button or Esc, so that the Dashboard gets its full width back.
15. As Andreas, I want Esc to close an open menu or dialog first rather than the drawer, so that Esc in the chat's slash menu doesn't throw the chat away.
16. As Andreas, I want to resize the drawer by dragging its edge, between 420 px and 80 % of the Dashboard's width, so that I can give the chat or the panels more room.
17. As Andreas, I want the drawer's width remembered across restarts, so that I set it once.
18. As Andreas, I want to find the same chat still open in the drawer when I come back from the Board, Context or Work, so that a detour doesn't lose my place.
19. As Andreas, I want the Dashboard to open with the drawer closed after an app restart, so that startup is always the plain overview.
20. As Andreas, I want the session shown in the drawer highlighted in Needs you and Live sessions, so that I can see where I am in the list.
21. As Andreas, I want the drawer to close by itself when its session is closed, so that it never shows a chat that no longer exists.
22. As Andreas, I want opening a chat in the drawer to leave Work's open chats as they were, so that the Dashboard and Work don't fight over what I'm looking at.
23. As Andreas, I want a session open in the drawer to show in its usual place when I switch to Work, so that the drawer never takes a chat away from Work.
24. As Andreas, I want clicking a "needs you" notification (toast or tray) while the Dashboard shows to open that session in the drawer, so that notifications keep me on the Dashboard too.
25. As Andreas, I want the same notification click from any other view to open the session in Work as today, so that nothing changes outside the Dashboard.
26. As Andreas, I want VS Code (observed) Live cards to keep opening in Work, since they are read-only and there is nothing to answer.
27. As Andreas, I want Now building rows to keep opening the feature on the Board, since they are about tickets rather than one chat.
28. As Andreas, I want the Needs you row's "Open in approvals" button to keep opening the approval inbox, so that the batch approval flow is unchanged.
29. As Andreas, I want the Dashboard's panels to reflow narrower beside the drawer rather than sit under it, so that nothing on the Dashboard is hidden while the drawer is open.

## Implementation Decisions

- **The drawer borrows Work's chat** (ADR 0004). Every hosted chat stays mounted inside Work and owns its process. While the Dashboard shows a drawer session, that session's mounted chat is positioned over the drawer's chat area and kept visible, while the rest of Work stays invisible. No second chat is mounted; process start and stop are untouched. Switching to Work returns the chat to its half, if it has one.
- **Drawer state is a new small store** holding the drawer's session (pane id or none) and its width share. The share is persisted, the session is not (not restored after a restart). Default share 0.4, minimum width 420 px, maximum 80 % (the Board's ticket drawer's numbers and the existing Drawer component's cap).
- **Opening in the drawer is a new navigation function** beside opening a session in Work. It sets the drawer's session and asks the chat to take focus (the existing focus request, so a pending approval prompt gets focus first). It does not touch Work's chat pair, the active workspace or the active session.
- **Clicks:** Needs you rows and hosted Live session cards open in the drawer. Observed Live cards and Now building rows are unchanged.
- **Ctrl+Shift+J on the Dashboard** picks the next waiting session after the drawer's session, in the order the Work list shows waiting sessions (the existing next-waiting rule, with the drawer's session in place of the session on screen in Work). With the drawer closed it opens the first waiting one. With none waiting it does nothing. In every other view the shortcut is unchanged.
- **Notification clicks** (toast and tray, the main process's open-session request) open in the drawer while the Dashboard is the current view and Settings is closed. Otherwise they open in Work as today.
- **Drawer header:** repo icon, worktree tag, session title, account tag, status, an "Open in Work" button and a close button. No Agents, Processes, Media or Test tabs and no IDE panels.
- **"Open in Work"** opens the session in Work's focused half (the existing open-in-Work behaviour) and closes the drawer.
- **Close:** the close button and Esc (unless an overlay, menu or dialog is open, as the existing Drawer component already checks). The drawer also closes when its session no longer exists among the hosted sessions.
- **Highlight:** the drawer's session row in Needs you and its Live card show a selected state.
- **Layout:** the Dashboard becomes the main region of a drawer host, so its panels reflow narrower beside the drawer, as the Board does with its ticket drawer.
- **Which chat "is on screen":** the existing "pane on screen" notion (used for unread/attention logic) also counts the drawer's session while the Dashboard shows, so a session being read in the drawer is treated as seen just as it would be in Work.

## Testing Decisions

- Good tests check what Andreas sees and does: which chat shows where, what a click or key does, what survives a view switch. They don't check how the layer is positioned.
- **Seam 1, the drawer state (Vitest, Node):** opening, swapping, closing when the session disappears, next-waiting selection with the drawer open, closed and with nothing waiting, notification routing by current view, the width share clamp and its persistence. Prior art: the dashboard and session-list state tests, and the chat pair tests.
- **Seam 2, one new UI scenario (Playwright on the fake CLI)** in a new dashboard spec file: on the Dashboard, a waiting session's Needs you row opens its chat in the drawer; a reply sent there reaches the fake CLI and the view is still the Dashboard; Ctrl+Shift+J swaps the drawer to the second waiting session; Board and back keeps the drawer on that session; "Open in Work" lands on it in Work. The suite goes from 12 to 13 of its 20 scenarios (counted by the budget counter) and must stay within 200 s.
- The change touches every hosted chat's layer in Work, so the whole UI suite runs once before the commit that changes it, not only the new scenario.

## Out of Scope

- Opening VS Code (observed) sessions in the drawer.
- Opening Now building rows as chats.
- The Agents, Processes, Media and Test tabs, and IDE panels, in the drawer.
- Several drawers or a grid of chats on the Dashboard.
- Moving process ownership out of the chat (ADR 0004).
- The approval inbox's own "open chat" action: it keeps opening Work from every view.
- Restoring the drawer's session after a restart.

## Further Notes

- Glossary: **Chat drawer** added.
- The approval inbox already answers approvals from anywhere; the drawer covers everything else a waiting session needs (Your turn replies, questions, plans) and approvals in context.
