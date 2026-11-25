# Background processes: see and stop what agents leave running

Status: ready-for-agent

## Problem Statement

Agents in a hosted session often start commands in the background: a dev server, a watcher, a long build. Today the app hides them. The chat shows one line when the command starts, and after that there is no way to see whether the server is still up, what it printed, which port it serves or how to stop it. Andreas has to ask the agent, or dig through Task Manager.

On Windows, closing a session or quitting the app kills only the CLI process. A dev server the agent started keeps running, holds its port and is no longer tracked anywhere.

## Solution

Each hosted session gets a **Processes tab** beside Chat, Agents and Media, with a count of running background processes on the tab, the same way Agents shows its working count. Each **background process** row shows:

- its status: Running, Finished, Failed or Stopped
- the command or its description, and how long it has run (or ran)
- the tail of its output, refreshed while it runs, in a read-only terminal-style view
- any local port it serves, found in its output and confirmed to answer, as an **open** link that opens the address in the default browser
- a **Stop** button while it runs, which asks the CLI to stop it

Running processes come first. Finished, failed and stopped ones stay listed, with their final status and last output, until the session closes. Nothing is saved to disk.

The session's row in the session list shows a small badge with the number of running background processes. Hovering it lists each one's command and port. The session's status (Running, Needs approval, Your turn, Idle) does not change because a background process is running.

When a hosted session closes, or the app quits, the app ends the CLI's whole process tree, so no background process is left behind.

## User Stories

1. As Andreas, I want a Processes tab on each hosted session, so that I can see what its agents left running.
2. As Andreas, I want the Processes tab to show how many background processes are running, so that I notice live servers without opening it.
3. As Andreas, I want each background process to show Running, Finished, Failed or Stopped, so that I know whether my dev server is still up.
4. As Andreas, I want each background process to show its command (or the agent's description of it), so that I can tell them apart.
5. As Andreas, I want to see how long a background process has run, or ran before it ended, so that I can spot one that died at once.
6. As Andreas, I want the tail of each background process's output, refreshed while it runs, so that I can read errors and logs without asking the agent.
7. As Andreas, I want the output shown read-only in a terminal-style view, so that it reads like the terminal it came from.
8. As Andreas, I want a finished, failed or stopped process to keep its last output, so that I can read why it ended.
9. As Andreas, I want a local port the process serves found in its output and checked to answer, so that I know the server is really up.
10. As Andreas, I want an open link for that port, opening in my default browser, so that I can try the app in one click.
11. As Andreas, I want the open link offered only for local addresses, so that the app never sends me anywhere unexpected (offline rule).
12. As Andreas, I want a Stop button on a running process, so that I can end a server the agent forgot about.
13. As Andreas, I want Stop to use the same stop the agent's own stop uses, so that the agent's view and mine agree.
14. As Andreas, I want running processes listed before ended ones, so that the live ones are at the top.
15. As Andreas, I want ended processes to stay in the list until the session closes, so that I keep the history of this session.
16. As Andreas, I want only commands that run in the background listed (started there, or moved there mid-run), so that one-second commands don't flood the list.
17. As Andreas, I want subagents kept out of the Processes tab, so that they stay in the Agents tab where they belong.
18. As Andreas, I want a badge with the running count on the session's row in the session list, so that I see which sessions have servers up.
19. As Andreas, I want hovering that badge to list each running process's command and port, so that I can tell what's up without opening the session.
20. As Andreas, I want the session status unchanged by a running background process, so that a dev server doesn't make an idle session look busy.
21. As Andreas, I want closing a hosted session to end every background process it started, so that no orphaned server holds a port.
22. As Andreas, I want quitting the app to end every hosted session's background processes, so that nothing survives the app.
23. As Andreas, I want the Processes tab empty-state to say no background processes are running, so that an empty tab reads as intended.
24. As Andreas, I want the tab and badge to update live while I'm looking at another session, so that the count is right when I switch.

## Implementation Decisions

- **Scope.** Hosted sessions only. Observed (VS Code) sessions get no Processes tab.
- **Which tasks count.** A background process is a CLI task with `task_type` `local_bash` that is backgrounded. That is either `task_started` with `is_backgrounded: true`, or a later `task_updated` whose patch has `is_backgrounded: true`. A foreground `local_bash` task that ends without being backgrounded is never listed. `local_agent` tasks are never listed.
- **Status mapping.** Running until an end event arrives. `task_updated` with patch status `completed` → Finished, `failed` → Failed, `killed` → Stopped. `task_notification` with status `completed` → Finished, `failed` → Failed, `stopped` → Stopped. The first end event wins, and later ones don't change it. The end time comes from the patch's `end_time`, else from when the event arrived.
- **Command text.** The Bash call's `command`, matched through the task's `tool_use_id`. If no `command` is found, the task's `description`.
- **Where state lives.** A pure reducer in shared code folds `system/task_*` events (plus the Bash tool_use inputs, for command text) into a session's list of background processes. The main process runs it per hosted session, beside the existing status reducer, and pushes the list to the renderer, so the session list's badge is right for sessions that aren't open. The list is dropped when the session closes.
- **Output.** While a session's Processes tab is visible, the renderer asks for each running process's output about once per second, through the CLI's `get_task_output {task_id}` control request (`{output, total_bytes, truncated}`). One last fetch happens when a process ends, and that output is kept for the ended row. The view shows the last 200 lines. No output request is sent while the tab is hidden.
- **Ports.** A pure function finds local URLs in the output: `http(s)://` + `localhost`, `127.0.0.1`, `0.0.0.0` or `[::1]` + `:port`. `0.0.0.0` and `[::1]` open as `localhost`. A found port gets an open link only after a TCP connect to `127.0.0.1:<port>` succeeds (the Apps page's existing port check). The check is redone on each output refresh until it succeeds, and the link is dropped when the process ends.
- **Open.** The open link uses the existing external-open path and refuses anything that is not a local address.
- **Stop.** The Stop button sends `stop_task {task_id}`. A failed stop shows the CLI's error on the row.
- **Badge.** The session-list row shows the running count, with no badge at zero. Its tooltip has one line per running process: the command, plus `:port` when a port is confirmed. The session status reducer is untouched.
- **Tree kill.** On Windows, killing a hosted session's CLI ends its whole process tree (`taskkill /PID <pid> /T /F`), after closing stdin as today. App quit waits for these kills to finish before it exits. Other platforms keep today's kill.
- **Auto-update unchanged.** The busy gate keeps waiting for every task, background processes included.
- **Fake CLI.** It learns:
  - a Bash call with `run_in_background: true`. This sends `task_started` with `is_backgrounded: true` and a result `Command running in background with ID: <id>. Output is being written to: <path>`, and it spawns a real child process (a tiny local HTTP server on a given port that prints its URL), so ports, Stop and the tree kill can be tested for real.
  - `get_task_output` (returns the child's output so far)
  - `stop_task` for a shell (kills the child, sends `task_updated` with status `killed`, then `task_notification` with status `stopped`)
  - a scripted exit of the child (sends `completed` or `failed`)
- **Real shape check.** Before building on the fake CLI's shapes, one real Haiku turn that starts a background command is recorded into the fixtures. It pins `task_started`'s `is_backgrounded`, the result text, `get_task_output`'s reply and the end events. The fake CLI is aligned to that recording.

## Testing Decisions

- Test external behaviour only: what the list holds for a sequence of CLI lines, which ports a given output yields, what the user sees in the built app.
- **Seam 1, the shared reducer** (unit, Vitest): feed recorded or fake CLI lines in, assert the background process list. It covers backgrounded at start, backgrounded mid-run, foreground-only ignored, agents ignored, each end status, first end wins, and command text from the Bash input. Prior art: the status reducer tests, the run-in-background tests and the subagents tests.
- **Seam 2, port detection** (unit): output text in, local ports out. Non-local hosts are ignored, duplicates are merged, and `0.0.0.0` / `[::1]` map to localhost.
- **Seam 3, one e2e scenario** on the fake CLI: an agent starts a background server, then:
  1. The Processes tab count and the session-row badge show 1.
  2. The row shows Running, the command and output.
  3. The open link appears once the port answers.
  4. Stop turns the row to Stopped and the badge goes away.
  5. A second background server is left running and the session is closed. Its port no longer answers, which proves the tree kill.

  That takes the suite to 17 of its 20 scenarios.
- The tree kill on its own: a unit or integration test on the session kill path, with a real child process tree, asserting that the grandchild is gone.

## Out of Scope

- Observed (VS Code) sessions.
- Restarting a process, or running commands from the Processes tab.
- Any change to auto-update's busy gate.
- Saving process history to disk, or showing processes after a session closes or the app restarts.
- Monitor tasks and MCP tasks (only `local_bash`).
- A project-wide or Dashboard overview of processes.
- Port detection by inspecting OS sockets (output text plus a connect check only).

## Further Notes

- The real CLI's result text for a backgrounded call is `Command running in background with ID: <id>. Output is being written to: <path>` (seen in this session's own tool output). The `get_task_output` reply shape comes from the extension research notes and is confirmed by the recording.
- The glossary terms are **Background process** and **Processes tab**. The CLI's word "task" stays out of the UI.
- The recording (ticket 01, `turn-background-bash.jsonl`) adds to the shapes above: the result text continues `… <path>. You will be notified when it completes. To check interim output, use Read on that file path.`; task lines carry a `run_id`; a `system/background_tasks_changed` line with the running list comes before `task_started` and after each end; `stop_task`'s end events (`task_updated` `killed`, `task_notification` `stopped`) arrive before its empty success reply; after a stop the output ends in `\n[killed]\n`. A process exiting by itself was not recorded.
