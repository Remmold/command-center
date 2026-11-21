# 06: Tray, hide-on-close and notifications

**What to build:** the app lives in the system tray. Closing the window hides it while sessions keep running, and a badge and tooltip show the waiting sessions. Windows notifications fire when a session needs Andreas.

**Blocked by:** 03, 05

**Status:** ready-for-agent

- [ ] Single-instance lock: a second launch focuses the first
- [ ] Closing the window hides it; sessions and status updates keep running
- [ ] Tray menu: Open, Sessions, Board, Start with Windows (checkbox, disabled here; ticket 07 wires it up), Quit. Quit confirms when any session is Running.
- [ ] Tray badge counts waiting sessions (Needs approval + Your turn); the tooltip names the waiting workspaces
- [ ] A Windows notification fires on entry into Needs approval or Your turn, unless the window is visible with that session on screen; clicking it opens the window on that session
