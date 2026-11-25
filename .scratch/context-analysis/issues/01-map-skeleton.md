# 01: Files | Map switch and the context map's lanes

**What to build:** the Context view gets a **Files | Map** switch above its middle and right panes (spec: `.scratch/context-analysis/spec.md`). Files is today's view, unchanged. Map draws the selected workspace's context map from the existing context report: lanes, bands, blocks sized by tokens, import lines, collapsed big groups, and a detail panel per block. There are no findings yet.

Rules (from the spec, word for word):
- The three context layers (Account, Repo, Local) are lanes, side by side in the order they apply. Each lane is split into three bands: **Every start** (CLAUDE.md files and their imports, MEMORY.md, and skill and agent names and descriptions), **On demand** (memory files, subfolder CLAUDE.md files, skill and agent bodies, commands) and **Behaviour** (settings, hooks, MCP servers, plugins: they shape what Claude may do and don't count toward tokens). Each item is a block sized by its tokens. Lines show imports, and MEMORY.md's links to memory files. A large group (more than 8 items) is one block ("176 memory files") that expands on click. Clicking a block shows a short plain-words explanation of what that kind is and how Claude loads it, the block's numbers, and its findings, with an **Open in Files** button.
- **Context map layout (renderer, pure).** `mapLayout(report, findings) → lanes → bands → blocks`, with each block's size from tokens (a floor for zero-token items), groups of more than 8 items collapsed, and edges for imports and index links. It is drawn as hand-made SVG and HTML with no new dependency.
- **Tour copy:** fixed text in the app per step and per item kind, with the workspace's numbers filled in. The explanation per kind says how Claude loads it (for example: "Skills: only the name and description load at start; the body loads when the skill is used").
- **Context store** gains `pane: 'files' | 'map'` (not saved) and the map's selected block and tour step. Leaving Files with unsaved edits uses the existing leave guard.
- Items shared with Personal and read-only items are marked on the map as in Files. A workspace whose folder is gone shows that instead of empty lanes. The map's numbers match Files' numbers.

In this ticket `findings` is always empty and index-link edges are absent (ticket 02 adds them). Skills and agents each appear once, in Every start, with the explanation saying their body loads on demand.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] The Files | Map switch shows; Files is unchanged; switching away from Files with unsaved edits asks through the existing leave guard.
- [ ] `mapLayout` unit tests (seam 5): the right band per kind, block size from tokens with a floor, groups of more than 8 collapsed (8 stays expanded), and import edges.
- [ ] Clicking a block shows its kind explanation and numbers; Open in Files switches to Files with that item open.
- [ ] Shared and read-only marks show; a missing workspace folder shows a message.
- [ ] Quick tier green.
