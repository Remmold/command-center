# 02: Processes tab with status, command and Stop

**What to build:** each hosted session has a Processes tab beside Chat, Agents and Media, with the running count on the tab. It lists the session's background processes, running ones first. Each row shows its status, its command and how long it has run, plus a Stop button while it runs (spec: `.scratch/background-processes/spec.md`). This is the tracer bullet: shared reducer, main process, IPC and UI.

Rules (from the spec, word for word):
- **Scope.** Hosted sessions only. Observed (VS Code) sessions get no Processes tab.
- **Which tasks count.** A background process is a CLI task with `task_type` `local_bash` that is backgrounded. That is either `task_started` with `is_backgrounded: true`, or a later `task_updated` whose patch has `is_backgrounded: true`. A foreground `local_bash` task that ends without being backgrounded is never listed. `local_agent` tasks are never listed.
- **Status mapping.** Running until an end event arrives. `task_updated` with patch status `completed` → Finished, `failed` → Failed, `killed` → Stopped. `task_notification` with status `completed` → Finished, `failed` → Failed, `stopped` → Stopped. The first end event wins, and later ones don't change it. The end time comes from the patch's `end_time`, else from when the event arrived.
- **Command text.** The Bash call's `command`, matched through the task's `tool_use_id`. If no `command` is found, the task's `description`.
- **Where state lives.** A pure reducer in shared code folds `system/task_*` events (plus the Bash tool_use inputs, for command text) into a session's list of background processes. The main process runs it per hosted session, beside the existing status reducer, and pushes the list to the renderer, so the session list's badge is right for sessions that aren't open. The list is dropped when the session closes.
- **Stop.** The Stop button sends `stop_task {task_id}`. A failed stop shows the CLI's error on the row.
- Running processes come first. Finished, failed and stopped ones stay listed, with their final status and last output, until the session closes. Nothing is saved to disk.
- The empty state says no background processes are running.
- Glossary: **Background process**, **Processes tab**. The CLI's word "task" stays out of the UI.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] Seam 1 unit tests for the shared reducer: backgrounded at start, backgrounded mid-run, foreground-only ignored, agents ignored, each end status, first end wins, command text from the Bash input. Also feed it the recording from 01. Prior art: the status reducer, run-in-background and subagents tests.
- [ ] The main process tracks the list per hosted session, pushes it to the renderer, and drops it on session close.
- [ ] The Processes tab has the running count, rows (status, command, duration) with running ones first, the empty state, and Stop, with its error shown on failure.
- [ ] New e2e scenario on the fake CLI: an agent starts a background server. The tab count shows 1 and the row shows Running and the command. Stop turns the row to Stopped and the count goes away. The suite stays within 20 scenarios and 90 s.
- [ ] Quick tier green.
