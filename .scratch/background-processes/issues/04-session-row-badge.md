# 04: Running-count badge on the session row

**What to build:** the session's row in the session list shows how many background processes are running, with a tooltip that lists them (spec: `.scratch/background-processes/spec.md`).

Rules (from the spec, word for word):
- **Badge.** The session-list row shows the running count, with no badge at zero. Its tooltip has one line per running process: the command, plus `:port` when a port is confirmed. The session status reducer is untouched.
- The session's status (Running, Needs approval, Your turn, Idle) does not change because a background process is running.
- The tab and badge update live while another session is open.

**Blocked by:** 03 (the tooltip's port)

**Status:** ready-for-agent

- [ ] A badge with the running count on the session row, hidden at zero. Its tooltip lines read `command`, or `command :port`.
- [ ] The session status is unaffected: the existing status reducer tests are untouched and green.
- [ ] The e2e scenario is extended: the badge shows 1 while the process runs and is gone after Stop.
- [ ] Quick tier green.
