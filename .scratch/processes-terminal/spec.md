# Processes view: every process and terminal in one place

**Status:** ready-for-agent

## Problem Statement

Andreas wants one overall look at everything left running: Claude's dev servers, watchers and long builds, and his own. Today he can't get it:

- The Processes tab shows only one session's background processes, inside that chat. Its output is a plain text tail, not a terminal.
- His own terminals live in each session's Shell drawer. They're scattered across sessions and end when that session's view closes.
- There's no place to watch and type into long-running commands across all workspaces, like a regular terminal.

## Solution

- A new **Processes view** (Ctrl+5, after Context). It lists every background process and every **terminal** across all workspaces, grouped by workspace with running ones first. The selected one's output shows on the right in a real terminal.
  - Terminals take keyboard input like any terminal.
  - Claude's background processes are read-only, with Stop and **Run it myself**. Run it myself stops Claude's copy and reruns the same command, in the same folder, as his own terminal.
- Terminals become one pool kept by the app, not by each session (ADR 0006).
  - The Shell drawer and the Processes view show the same terminals.
  - Closing a session, the drawer or a view never ends a terminal. Only Close, the command exiting, or quitting the app does.
  - Quitting with terminals still running asks first.
- **New terminal** in the Processes view: pick a workspace and give an optional command (e.g. `pnpm dev`).
  - When the command exits, the terminal stays as Exited with its code and output, with Restart and Close.
- The per-session Processes tab stays, but shows output in the same terminal look and links to the Processes view.

## User Stories

1. As Andreas, I want a Processes view on Ctrl+5 and in the title bar's view switcher, so that I can see everything running in one place.
2. As Andreas, I want the list grouped by workspace (repo icon and display name), so that I can find a project's processes fast.
3. As Andreas, I want running items first within each workspace and ended ones below, so that live things are on top.
4. As Andreas, I want each row to say who started it: the Claude session's title, or "You", so that I know whose it is.
5. As Andreas, I want each row to show status (Running, Finished, Failed, Stopped, Exited with code), name or command, age, and any local port it serves as an open link, so that I can read the state at a glance.
6. As Andreas, I want the selected item's output on the right in a real terminal (colours, cursor moves, scrollback), so that it reads like a terminal.
7. As Andreas, I want to type into a selected terminal of mine, with copy, paste and resize working as in the Shell drawer, so that it is a regular terminal.
8. As Andreas, I want Claude's background processes shown read-only and following live while selected, so that I can watch them.
9. As Andreas, I want Stop on Claude's running processes and on my running terminals, so that I can end them from here.
10. As Andreas, I want **Run it myself** on a running or ended Claude background process, behind a confirm, so that I can get a process I can type into.
11. As Andreas, I want Run it myself to stop Claude's copy, start the same command in that session's workspace folder as my own terminal, and select it, so that I can carry on at once.
12. As Andreas, I want the confirm to say that Claude won't see the output any more, so that I know the trade.
13. As Andreas, I want a **New terminal** button that asks for a workspace and an optional command, so that I can start a dev server from the view.
14. As Andreas, I want a terminal with a command to run that command in my default shell kind and be named after it, so that the list reads well.
15. As Andreas, I want a terminal without a command to be a plain interactive shell named after the shell, so that I can work freely.
16. As Andreas, I want to rename a terminal, so that I can label it.
17. As Andreas, I want a terminal whose process exits to stay listed as Exited (code), with its output kept, so that I can read why it ended.
18. As Andreas, I want Restart on an exited terminal to rerun the same command in the same place, clearing the screen, so that a crashed dev server is one click away.
19. As Andreas, I want Close to end a terminal (with no confirm when it has exited, a confirm when it is running) and remove it, so that the list stays tidy.
20. As Andreas, I want terminals I open in the Shell drawer to show in the Processes view too, and the same terminal to keep working in both, so that there's one pool.
21. As Andreas, I want "Open in Shell drawer" on a terminal, which opens Work at a session of that workspace with the drawer showing that terminal, so that I can use it beside the chat.
22. As Andreas, I want a terminal to keep running when its session closes, its drawer tab closes, or I leave the view, so that dev servers don't die by accident.
23. As Andreas, I want closing a drawer tab to remove the terminal from that drawer only, and the Processes view's Close to end it, so that the two actions don't surprise me.
24. As Andreas, I want a terminal shown again (in the drawer or the view, or after a remount) to replay its recent output and then follow live, so that I never see a blank screen.
25. As Andreas, I want shells opened "as an account" (from Accounts or usage) to stay terminals with that account's environment, so that nothing about them changes.
26. As Andreas, when I really quit the app with running terminals, I want "N terminals still running: quit anyway?", so that I don't kill a dev server by mistake. Closing the window to the tray doesn't ask.
27. As Andreas, I want Claude's background processes to keep today's rules (listed until their session closes, ended with it), so that nothing changes there.
28. As Andreas, I want the per-session Processes tab to show each process's output in the same terminal look, with "Open in Processes", so that the two places look alike.
29. As Andreas, I want the Work session list's process badge to stay as it is, so that the list doesn't change.
30. As Andreas, I want the view to work offline and start no network requests, so that it follows the offline rule.

## Implementation Decisions

**Terminal registry (main), ADR 0006**
- A main-side registry wraps the existing pty manager. Each terminal records: `{ id, workspaceId, cwd, label, command?, kind, env?, status: 'running' | 'exited', exitCode?, startedAt, endedAt? }`.
- It keeps a capped output tail per terminal: the last **256 KB** of raw pty data. Attaching replays the tail, then streams live.
- New IPC: list, changed (push), create, attach (returns the tail), write, resize, rename, restart, close. The existing `pty:*` channels and the Shell drawer move onto this registry. The drawer's tab list keeps only terminal ids per project view.
- Closing a project view no longer kills its tabs' ptys. They stay in the registry, unattached to any drawer.
- A terminal with a command runs it through the chosen shell's run-a-command form (`-Command` for pwsh/powershell, `/c` for cmd, `-c` for bash), so the pty exits when the command ends. A terminal without a command is the plain shell.
- Restart starts a new pty with the same id, label, cwd, kind, env and command, and clears the tail.
- Close kills the pty (tree kill, like the CLI's `taskkill /T /F`) and removes the entry.
- Quit: on a real quit (the existing quitting path, not close-to-tray) with any running terminal, show a native confirm: "N terminals still running: quit anyway?". Cancel aborts the quit. Then kill all.
- Local ports for terminals use the same detection as background processes (shared localPorts), run over the terminal's output tail.

**Processes view (renderer)**
- A new `AppView` `'processes'`, appended to `APP_VIEWS`, so Ctrl+5 and the title bar switcher pick it up. `parseView` accepts it.
- Left: the list. Groups follow the workspace's repo identity (repo icon and display name). Rows within a group: running first, then ended; newest first within each.
  - Claude rows come from the existing background process tracker across all hosted sessions, with the session title as owner.
  - Terminal rows come from the registry, with "You" as owner.
- Right: one terminal panel for the selected row.
  - Terminals attach interactively, reusing the existing xterm component with the registry instead of `pty:*`.
  - Claude processes show in a read-only xterm. The panel polls `get_task_output` once per second while selected and writes only the bytes added since the last poll, using `total_bytes`. If the output was cut (`truncated`), or the CLI's text no longer starts with what was written, it clears the panel and rewrites it.
- The header has New terminal plus the selected row's actions: Stop, Run it myself, Restart, Close, Rename, Open in Shell drawer, and the port link.
- Selection survives switching views. With nothing selected, the first running row is selected.

**Run it myself**
- It is offered for Claude background processes of hosted sessions. The confirm reads: "Stop Claude's copy and run `<command>` yourself in `<workspace>`? Claude won't see its output any more."
- On OK it calls the existing `stop_task` (skipped if already ended), then creates a terminal with that command, the session's workspace folder as cwd, the default shell kind, and the label = the command. Then it selects it.
- Nothing is sent to the chat.

**Processes tab (per session)**
- Each process's output uses the same read-only xterm panel instead of `TerminalOutput`. It keeps the existing 1 s polling while on screen.
- An "Open in Processes" link switches to the view with that process selected.

**Out of the renderer's hands:** a hosted chat still owns its Claude process (ADR 0004). The view only reads the tracker and sends `get_task_output` and `stop_task` through the existing channels.

## Testing Decisions

Good tests check what a user or a caller sees: given terminals and processes, what list comes out; given pty output, what an attaching view gets. Not private helpers or DOM shapes.

Seams:
1. **The terminal registry (main), with node-pty faked.** Covers: create with and without a command (the shell's command form per kind), exit sets Exited and the code, the tail is capped at 256 KB and replayed on attach, restart clears the tail and reuses the id, close kills and removes, closing a project view doesn't end its terminals, and the running count used by the quit confirm.
2. **A pure list builder for the Processes view** (renderer state, prior art `sessionList.test.ts` and the background process reducer tests). Covers: grouping by workspace, running first, ended below, newest first, owners, and ports.
3. **A pure output-delta function** for Claude processes: append the new bytes, or rewrite when the output was cut or no longer matches.
4. **UI suite** (`e2e/`, 13 of 20 scenarios used before this flow; budget 20 scenarios and 200 s). Add at most **two** scenarios, on the fake CLI:
   - (a) In the Processes view, start a New terminal with a command that prints and stays alive, type into a plain terminal and see the echo, see the same terminal in the Shell drawer, and close it.
   - (b) A Claude background server shows in the Processes view with live output and its port, and Run it myself stops it and leaves a running terminal of mine with the same command.
   - Extend `processes.spec.ts` rather than adding scenarios where cheap. Check with `pnpm e2e:count`.
5. How the terminal looks and feels when typing in it is Lane 2.

## Out of Scope

- Typing into Claude's background processes (the CLI gives the app no input channel to them).
- Telling Claude about a process Andreas ran himself.
- Terminals that survive an app restart.
- Background processes of VS Code sessions (no control channel).
- Split panes or several terminals side by side in the view.
- Changing when Claude's background processes end (they still end with their session).

## Further Notes

- Glossary: new **Terminal**, **Processes view**, **Run it myself** and **Shell drawer**. The Processes tab entry now says "terminal look". The process button is not called "Take over", because that word already means moving a VS Code session into the app.
- ADR 0006 records why terminals moved into main and why that's the opposite of ADR 0004's choice for chats.
- Flow A (`ui-polish`) is not merged yet. This branch starts from its last commit.
