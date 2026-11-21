# 05: Session status and the Needs you queue

**What to build:** every hosted session shows one session status (Running, Needs approval, Your turn, Idle), derived in the main process. A Needs you queue lists waiting sessions across all workspaces, oldest wait first. A shortcut jumps to the next one and focuses its input or approval prompt. This is spec seam 2, the session status reducer.

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] A pure reducer in the main process maps (previous status, event) to the next status: process spawned → Running; user message sent → Running; permission request raised for the session → Needs approval; permission request resolved and none left → Running; result event (turn finished) → Your turn; process exit → Idle
- [ ] It records when each status started; the queue sorts by longest wait
- [ ] Status changes are broadcast to the renderer; status dots show on sidebar rows, session tabs and board cards (workspace level)
- [ ] The renderer reports which session is on screen and whether the window is visible (consumed by ticket 06)
- [ ] Tests from recorded event sequences, including two overlapping permission requests and an exit during Needs approval
