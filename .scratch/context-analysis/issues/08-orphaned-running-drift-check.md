# 08: A drift check whose session never ran stops showing as running

**What to build:** a drift check shows as "running" on the map only while its session can still finish it. Today, if a run's session is created but its process never runs (it fails at spawn, or the chat is closed before the first reply), the run file stays a bare skeleton that is never `done`. The map then shows it as running forever, and its live watch never stops.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] A run that isn't `done` and whose session no longer exists in the app shows as "stopped" (not running) on the map, with Open chat hidden, and its live watch ends.
- [ ] A stopped run that is still a bare skeleton (no steps, no findings) is removed, under the same guard the app already uses for a session that never started (ADR 0005).
- [ ] A stopped run that holds findings keeps them on the map, with its date, so they can still be applied (through a new session, as ticket 06 does).
- [ ] Unit tests in the findings and drift-check reader tests cover: live session → running; session gone with findings → stopped, findings kept; session gone, bare skeleton → removed.
- [ ] Quick tier green.
