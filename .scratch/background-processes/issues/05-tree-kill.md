# 05: Closing a session or quitting ends its background processes

**What to build:** on Windows, closing a hosted session or quitting the app ends the CLI's whole process tree, so no background process is left holding a port (spec: `.scratch/background-processes/spec.md`).

Rules (from the spec, word for word):
- **Tree kill.** On Windows, killing a hosted session's CLI ends its whole process tree (`taskkill /PID <pid> /T /F`) while the CLI is still alive, then closes stdin as today. If stdin closed first, the CLI could exit and leave its children orphaned, out of reach of `/T`. App quit waits for these kills to finish before it exits. Other platforms keep today's kill.
- **Auto-update unchanged.** The busy gate keeps waiting for every task, background processes included.

**Blocked by:** 01 (the fake CLI's real child). Run it after 04, since both extend the same e2e scenario.

**Status:** resolved

- [x] A test on the session kill path, using a real child process tree, asserts that the grandchild is gone.
- [x] App quit waits for the tree kills.
- [x] The e2e scenario is extended: a second background server is left running, then the session is closed, and its port no longer answers. The suite ends at 16 of 20 scenarios, within 100 s (budget raised from 90 s to 100 s, then 200 s, by Andreas on 2026-11-25; the scenario count was corrected from 17).
- [x] Quick tier green.

## Comments

- The scenario is extended and passes (7.9 s): a second server is left running, the session is closed from its row menu, and the port stops answering. The suite count was 16 before and after (no new test). The full run took 1.6 min and 1.9 min, so the 90 s part of the box is not met; the overrun predates this ticket.
- Quit holds for at most 3 s; each tree kill gives up after 2 s. A session started during that hold is not killed; the update installer's own close runs alongside the hold.
