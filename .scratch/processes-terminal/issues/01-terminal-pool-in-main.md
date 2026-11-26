# 01: Terminals live in main; the Shell drawer attaches to them

**What to build:** terminals become one pool kept by the main process (ADR 0006), and the Shell drawer becomes a window onto that pool. The drawer looks and works as before, with one change: closing a session or its project view no longer ends its terminals. Spec: `.scratch/processes-terminal/spec.md` (user stories 20, 22–25, "Terminal registry (main)").

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] A main-side registry wraps the existing pty manager. Each terminal records: `{ id, workspaceId, cwd, label, command?, kind, env?, status: 'running' | 'exited', exitCode?, startedAt, endedAt? }`.
- [ ] It keeps a capped output tail per terminal: the last **256 KB** of raw pty data. Attaching replays the tail, then streams live.
- [ ] New IPC: list, changed (push), create, attach (returns the tail), write, resize, rename, restart, close. The existing `pty:*` channels and the Shell drawer move onto this registry. The drawer's tab list keeps only terminal ids per project view.
- [ ] Closing a project view no longer kills its tabs' ptys. They stay in the registry, unattached to any drawer. Closing a drawer tab removes the terminal from that drawer only.
- [ ] A terminal with a command runs it through the chosen shell's run-a-command form (`-Command` for pwsh/powershell, `/c` for cmd, `-c` for bash), so the pty exits when the command ends. A terminal without a command is the plain shell. (The create IPC supports both now; ticket 03 adds the UI for commands.)
- [ ] Restart starts a new pty with the same id, label, cwd, kind, env and command, and clears the tail.
- [ ] Close kills the pty (tree kill, like the CLI's `taskkill /T /F`) and removes the entry.
- [ ] The registry exposes the count of running terminals (ticket 05's quit confirm uses it).
- [ ] Shells opened "as an account" (from Accounts or usage) stay terminals with that account's environment.
- [ ] Unit tests on the registry with node-pty faked: create with and without a command (the shell's command form per kind), exit sets Exited and the code, the tail is capped at 256 KB and replayed on attach, restart clears the tail and reuses the id, close kills and removes, closing a project view doesn't end its terminals, the running count.
- [ ] The existing UI-suite shell step (`e2e/app.spec.ts`, "a shell steps the zoom…") still passes; run the whole UI suite once, since the drawer is on every Work screen.
