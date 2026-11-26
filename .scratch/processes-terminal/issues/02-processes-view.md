# 02: Processes view with every process and terminal

**What to build:** a new **Processes view** (Ctrl+5) lists every Claude background process and every terminal across all workspaces, grouped by workspace with running ones first. The selected one shows on the right in a real terminal: interactive for terminals, read-only and following live for Claude's processes, with Stop and the port link. Spec: `.scratch/processes-terminal/spec.md` (user stories 1–9, 30, "Processes view (renderer)").

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] A new `AppView` `'processes'`, appended to `APP_VIEWS`, so Ctrl+5 and the title bar switcher pick it up. `parseView` accepts it.
- [ ] Left: the list. Groups follow the workspace's repo identity (repo icon and display name). Rows within a group: running first, then ended; newest first within each.
  - Claude rows come from the existing background process tracker across all hosted sessions, with the session title as owner.
  - Terminal rows come from the registry, with "You" as owner.
- [ ] Each row shows status (Running, Finished, Failed, Stopped, Exited with code), name or command, age, and any local port it serves as an open link. Local ports for terminals use the same detection as background processes (shared localPorts), run over the terminal's output tail.
- [ ] Right: one terminal panel for the selected row.
  - Terminals attach interactively, reusing the existing xterm component with the registry instead of `pty:*`.
  - Claude processes show in a read-only xterm. The panel polls `get_task_output` once per second while selected and writes only the bytes added since the last poll, using `total_bytes`. If the output was cut (`truncated`), or the CLI's text no longer starts with what was written, it clears the panel and rewrites it.
- [ ] Stop on Claude's running processes (existing `stop_task`) and on running terminals.
- [ ] Selection survives switching views. With nothing selected, the first running row is selected.
- [ ] A hosted chat still owns its Claude process (ADR 0004). The view only reads the tracker and sends `get_task_output` and `stop_task` through the existing channels. No network requests (offline rule).
- [ ] Unit tests: a pure list builder (grouping by workspace, running first, ended below, newest first, owners, ports; prior art `sessionList.test.ts`) and a pure output-delta function (append the new bytes, or rewrite when the output was cut or no longer matches).
- [ ] No new UI scenario in this ticket (tickets 03 and 04 add them). Run the whole UI suite once (new view in the switcher).
