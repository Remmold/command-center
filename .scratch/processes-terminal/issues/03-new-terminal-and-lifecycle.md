# 03: New terminal, Exited, Restart, Close, Rename, Open in Shell drawer

**What to build:** from the Processes view Andreas starts a terminal in a workspace, with an optional command. A terminal whose process exits stays as Exited with its code and output, with Restart and Close. Terminals can be renamed and opened in the Shell drawer. Spec: `.scratch/processes-terminal/spec.md` (user stories 13–21, 23).

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] A **New terminal** button asks for a workspace and an optional command. The workspace's folder is the cwd, and the shell is the default shell kind.
- [ ] A terminal with a command runs it and is named after it. A terminal without a command is a plain interactive shell named after the shell.
- [ ] Rename a terminal.
- [ ] A terminal whose process exits stays listed as Exited (code), with its output kept.
- [ ] Restart on an exited terminal reruns the same command in the same place, clearing the screen.
- [ ] Close ends a terminal (no confirm when it has exited, a confirm when it is running) and removes it.
- [ ] "Open in Shell drawer" opens Work at a session of that workspace, with the drawer showing that terminal. If the workspace has no open session, open a new one there, as Work's existing open-in-workspace path does. If that needs a decision, stop and report it.
- [ ] Closing a drawer tab removes the terminal from that drawer only; the Processes view's Close ends it.
- [ ] UI suite: add scenario (a), on the fake CLI. In the Processes view, start a New terminal with a command that prints and stays alive, type into a plain terminal and see the echo, see the same terminal in the Shell drawer, and close it. At most this one new scenario; check `pnpm e2e:count` (13 of 20 before this flow).
