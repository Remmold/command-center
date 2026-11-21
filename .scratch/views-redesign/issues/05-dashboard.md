# 05: The Dashboard

**What to build:** the Dashboard shows Needs you, Now building, Live sessions and Usage per account on one screen, and every item clicks through. The Now building strip moves here from the Board. This is spec seam 2, the dashboard model.

**Blocked by:** 03, 06

**Status:** ready-for-agent

- [ ] Dashboard model (pure): takes the session list inputs plus the board model and usage; returns Needs you items, Now building rows (reusing ticket 16 of workspace-hub's rules unchanged), Live session cards and usage rows per profile
- [ ] **Needs you** at the top: every waiting session oldest first with repo icon, worktree tag, title, status (Needs approval / Your turn) and wait time. Clicking opens that session in Work with its input or approval prompt focused.
- [ ] **Now building** with today's rules (active features, progress bar, ticket in progress, session status, last note, time ago, 6 rows + more). Clicking a row opens the Board filtered to that feature. The strip is removed from the Board.
- [ ] **Live sessions**: a grid of cards, one per session that is Running, Needs approval or Your turn, plus observed VS Code sessions that are Live. Each card shows repo icon, worktree tag, title, status, the last assistant message snippet (2 lines) and time since the last event. Clicking opens it in Work. The snippet comes from the session's chat items; for observed sessions from their tail.
- [ ] **Usage per account**: one row per profile with how full its rate-limit window is, when it resets, and today's tokens
- [ ] Empty sections say so in one muted line (e.g. "Nobody is waiting on you")
- [ ] Tests for the model: Needs you order; Live cards include exactly Running / Needs approval / Your turn plus observed Live; snippet taken from the last assistant message; usage rows per profile; empty sections
