# 02: Subagents shown the way the extension shows them

**What to build:** when Claude starts a subagent (the Agent tool, formerly Task), its messages are grouped under that tool call instead of mixed into the main chat. The call shows the subagent's description, status and progress the way the extension does. You can open its transcript and stop it where the extension lets you. Background subagents and `SendMessage` / `SubagentHandback` follow the extension too.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Research first:
  - Find out how the extension renders Agent tool calls and subagent messages (`parent_tool_use_id`): collapsed and expanded state, wording, status (running, done, error, stopped), and whether background agents differ.
  - Find out what `stop_subagent`, `get_subagent_transcript` and `get_task_output` send to the CLI (control request subtypes and fields).
  - Record it in `docs/research/vscode-extension-controls.md`.
- [ ] Messages with `parent_tool_use_id` render inside their parent Agent call, not in the main flow, live while streaming. The main chat's scroll-follow, copy buttons and "Thought for Ns" behave as before for the main agent.
- [ ] Status, the stop action and the transcript view as in the extension, using the same CLI requests.
- [ ] Resumed sessions (loaded from the transcript `.jsonl`) group the same way.
- [ ] Tests:
  - pure grouping and status;
  - fake CLI script support for a subagent turn, cloned from a real recording, with the shape taken from the CLI or extension bundle rather than a real prompt where possible;
  - a smoke scenario: a subagent's messages appear under its call, and stop sends the right request.
