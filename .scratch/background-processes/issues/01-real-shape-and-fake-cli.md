# 01: Real background-command shape recorded, fake CLI taught background processes

**What to build:** the fake CLI can play an agent that starts a real background process, so later tickets can be tested for real with zero tokens. First, one real Haiku turn pins the CLI's actual shapes (spec: `.scratch/background-processes/spec.md`).

Rules (from the spec, word for word):
- **Real shape check.** Before building on the fake CLI's shapes, one real Haiku turn that starts a background command is recorded into the fixtures. It pins `task_started`'s `is_backgrounded`, the result text, `get_task_output`'s reply and the end events. The fake CLI is aligned to that recording.
- **Fake CLI.** It learns:
  - a Bash call with `run_in_background: true`. This sends `task_started` with `is_backgrounded: true` and a result `Command running in background with ID: <id>. Output is being written to: <path>`, and it spawns a real child process (a tiny local HTTP server on a given port that prints its URL), so ports, Stop and the tree kill can be tested for real.
  - `get_task_output` (returns the child's output so far)
  - `stop_task` for a shell (kills the child, sends `task_updated` with status `killed`, then `task_notification` with status `stopped`)
  - a scripted exit of the child (sends `completed` or `failed`)
- Where the recording disagrees with these shapes, the recording wins. Update the fake CLI to match it, and note the difference under `## Comments` here and in the spec's Further Notes.

Token budget: real Claude only as Haiku one-liners, at most 2 real turns for this ticket (one recording, one retry). The recording asks for a tiny background command (for example, a one-line node HTTP server on a free port). Then the harness sends `get_task_output` and `stop_task` for it, so the output reply and the end events are captured. Kill any process left over afterwards.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] A fixture recording of a real backgrounded Bash turn, including `get_task_output`'s reply and the stop's end events, with notes updated the way the existing recordings have them.
- [x] Fake CLI: a background Bash call that spawns a real child server which prints its URL; `get_task_output`; `stop_task` for shells; a scripted child exit, `completed` or `failed`. All documented in the fake CLI's README.
- [x] Fake CLI tests cover each new behaviour (prior art: the existing fake CLI tests), and no child process outlives a test.
- [x] Quick tier green.

## Comments

Recording (`src/main/claude/fixtures/turn-background-bash.jsonl`, CLI 2.1.293, one Haiku turn) differs from the shapes above in these ways; the fake follows the recording:
- The result text goes on after the path: `Command running in background with ID: <id>. Output is being written to: <path>. You will be notified when it completes. To check interim output, use Read on that file path.` The path is the CLI's temp folder (`%TEMP%\claude\<cwd key>\<session>\tasks\<id>.output`). The tool result also carries `tool_use_result.backgroundTaskId`.
- Every task line has a `run_id`. A `system/background_tasks_changed` line (`tasks: [{task_id, run_id, task_type, description}]`, the running list) comes right before `task_started` and right after each end.
- `stop_task` sends `task_updated` (`killed`, `end_time`), `task_notification` (`stopped`, with `tool_use_id`, `output_file`, `summary` = the description) and `background_tasks_changed` before its reply, which is an empty success (`response: {}`). No new turn followed the stop.
- `get_task_output` answered `{output, total_bytes, truncated}` as expected; after the stop the output ends in `\n[killed]\n`.
- Not recorded, built from the schema: a process that exits by itself (`completed` / `failed`), and the error text for an unknown task id.
