# 07: Hooks and status line editors

**What to build:** the Hooks category lists hooks per event with plain explanations and lets Andreas add, edit, retype and remove hooks of every type; the status line gets its own small editor. Spec: `.scratch/claude-settings/spec.md` (user stories 29–31, 36).

**Blocked by:** 05

**Status:** ready-for-agent

- [ ] Hooks are listed per event (when they run), each with its matcher, type, command, timeout and status message.
- [ ] Each hook event is explained in plain words ("Before a tool runs"), for every documented event.
- [ ] Add, edit, turn into another type and remove hooks of every type (command, prompt, agent, http, mcp tool), each with its own fields.
- [ ] The status line editor shows the command and its options with a plain explanation, and can change or remove it.
- [ ] Vitest: editing one hook leaves the event's other hooks and the other events unchanged in the patch.
