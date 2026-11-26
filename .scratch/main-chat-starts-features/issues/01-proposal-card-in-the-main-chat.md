# 01: The main chat proposes a feature and the chat shows it as a card

**What to build:** when a plan is agreed and Andreas says "start it", the main chat writes a `feature-proposal` block and the chat shows it as a card with the four fields (workspace, name, description, starting brief), the full brief readable. The card has no Go yet (ticket 02). Spec: `.scratch/main-chat-starts-features/spec.md` (user stories 1–5, 7, 9–11, 21, 22; Decisions "Channel", "Liveness", "Workspace resolution", "Instructions"). ADR 0009, ADR 0008.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] A shared module holds the proposal format: a fenced block tagged `feature-proposal` in an assistant reply, four labelled parts (workspace, name, description, brief), written with a four-backtick fence so a brief may contain fenced code. One parser and one instructions text, from the same module.
- [ ] The main chat's rules (may propose, never claims to have started anything, one proposal at a time, point at the Go button, asks which workspace when it is unclear, read-only otherwise) are added to its launch arguments as an appended system prompt, so a chat resumed from before this feature has them. The first prompt keeps the digest pointer.
- [ ] The digest gets a **Workspaces** section listing the labels the New feature dialog's Workspace picker shows (`workspaceLabel`, same list). The per-feature blocks of the digest are **identical** to before, and the digest rewrites when the workspace list changes.
- [ ] The card shows workspace, name, description and the whole brief. A workspace text that matches exactly one label resolves; none or several shows "Workspace unclear" on the card.
- [ ] A card is live when it is the last proposal in the transcript, no user message follows it and the chat has settled its turn; derived from the transcript, nothing stored. A non-live card whose name equals an existing feature's name reads Started, else Superseded. Several features from one discussion are proposed one after another, each its own card.
- [ ] A block that does not parse shows as ordinary text with the note "Proposal not understood, ask the chat to write it again".
- [ ] The main chat's tool list, denied list, `--strict-mcp-config` and `mainChatReply` are **unchanged**: a test pins that its arguments still offer only `Read,Grep,Glob` and carry the appended instructions, and that the chat still cannot stop, complete, reopen or delete a feature.
- [ ] Vitest: parser round trip, a brief holding a fenced code block, a missing part, two blocks; liveness and Started/Superseded over a list of chat items; workspace resolution (one, none, several); digest Workspaces section and unchanged feature blocks; launch arguments.
