# 02: The Agents tab tells the truth about old agents

**What to build:** Andreas (2026-11-24), on the Agents tab of a long, often-resumed chat (screenshot: `C:/Users/remmold/AppData/Local/Temp/agents-tab-stale.png`): "has the agents been working for 4000 minutes? are they still working?"

What's wrong:
- Agents that ended days ago show "Working · 4154m 29s" with "now: SubagentHandback". SubagentHandback is the agent delivering its report, which means it finished.
- The pinned bar says "1 agent still working" when nothing is.
- Each finished reviewer row shows the boilerplate "This agent's report was delivered to you as a message from … Read it there; it is not repeated here." instead of the report.
- "Agents 207" lists the whole chat history, oldest first.

Cause: the live status comes from the parent CLI's task events (`task_started`, `task_notification`, `task_updated`). A resumed chat's new process never re-emits them for old agents, and the file-based fallback treats a never-ended agent as working.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] **Finished detection, from the agent's own file:** an agent counts as finished when its `.jsonl` shows:
  - a **SubagentHandback** tool call, or the CLI's equivalent final report; check the CLI or extension bundle and the agents' files;
  - or a final assistant message with no pending tool call, followed by the session's tool result or notification for that agent;
  - or the parent transcript containing the agent's completion (the Agent tool result, or the `<task-notification>` user message).

  An agent with **no live parent process** and no file growth for more than **10 minutes** is "Ended (no final report)". Never "Working". The same rules drive the pinned "agents still working" bar and the Work list's Running status.
- [x] **Durations:** finished agents show start to finish, from the timestamps of their first and last line. Working agents show elapsed time. An agent never shows a duration that keeps growing once it's finished.
- [x] **Report text:** a finished agent's row shows the **first lines of its actual report**: the SubagentHandback content, or the final assistant text. Never the CLI's "delivered to you as a message … not repeated here" notice; detect and replace it. The live view shows the full report at the end.
- [x] **Order and grouping:**
  - Agents are grouped by the parent turn that started them, newest turn first, each with a small "started at 14:05 · 5 agents" header.
  - Only the newest group is open; older groups fold.
  - The tab label counts **working** agents when there are any ("Agents 2 working"), otherwise just "Agents".
- [x] **Tests:**
  - pure: the finished detection for each case above, plus the stale timeout;
  - the duration math;
  - report extraction, including the boilerplate replacement;
  - grouping and order.

  Fixtures are synthetic agent files shaped like the real ones; copy the shape, not the content, from `~/.claude/projects/C--projects-personal-command-center/<session>/subagents/` (read-only). Extend the existing subagent UI step for the "resumed chat with old finished agents" case. **No new scenario.** Gate as usual.
