# 05: Closing a session or quitting ends its background processes

**What to build:** on Windows, closing a hosted session or quitting the app ends the CLI's whole process tree, so no background process is left holding a port (spec: `.scratch/background-processes/spec.md`).

Rules (from the spec, word for word):
- **Tree kill.** On Windows, killing a hosted session's CLI ends its whole process tree (`taskkill /PID <pid> /T /F`), after closing stdin as today. App quit waits for these kills to finish before it exits. Other platforms keep today's kill.
- **Auto-update unchanged.** The busy gate keeps waiting for every task, background processes included.

**Blocked by:** 01 (the fake CLI's real child). Run it after 04, since both extend the same e2e scenario.

**Status:** ready-for-agent

- [ ] A test on the session kill path, using a real child process tree, asserts that the grandchild is gone.
- [ ] App quit waits for the tree kills.
- [ ] The e2e scenario is extended: a second background server is left running, then the session is closed, and its port no longer answers. The suite ends at 17 of 20 scenarios, within 90 s.
- [ ] Quick tier green.
