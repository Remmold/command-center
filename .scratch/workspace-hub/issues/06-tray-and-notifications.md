# 06: Tray, hide-on-close and notifications

**What to build:** the app lives in the system tray. Closing the window hides it while sessions keep running, and a badge and tooltip show the waiting sessions. Windows notifications fire when a session needs Andreas.

**Blocked by:** 03, 05, 13

**Status:** resolved

- [x] Single-instance lock: a second launch focuses the first
- [x] Closing the window hides it; sessions and status updates keep running
- [x] Session status change: process spawned → Idle (a fresh or resumed chat with no turn yet is not working and not waiting), replacing spawned → Running in the reducer, with its test updated
- [x] Tray menu: Open, Sessions, Board, Start with Windows (checkbox, disabled here; ticket 07 wires it up), Quit. Quit confirms when any session is Running.
- [x] Tray badge counts waiting sessions (Needs approval + Your turn); the tooltip names the waiting workspaces
- [x] A Windows notification fires on entry into Needs approval or Your turn, unless the window is visible with that session on screen; clicking it opens the window on that session
