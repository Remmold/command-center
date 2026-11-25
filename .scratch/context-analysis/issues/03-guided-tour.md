# 03: Guided tour beside the map

**What to build:** a column of six steps beside the context map that walks through it in plain words, using the workspace's real numbers (spec: `.scratch/context-analysis/spec.md`).

Rules (from the spec, word for word):
- **Guided tour.** A column of six steps: 1 What every chat starts with · 2 Memory · 3 Skills, agents & commands · 4 Settings, hooks & MCP · 5 Health check · 6 Drift check. Each step highlights its part of the map and explains it with this workspace's real numbers ("Every chat here starts with ~4.2k tokens: 2.1k from your account CLAUDE.md, …"). Back and Next move between steps, and clicking the map works at any time.
- **Tour copy:** fixed text in the app per step and per item kind, with the workspace's numbers filled in.
- Step 5 lists the health check's findings (problems first, then notes), each clickable to select its block.
- Step 6 in this ticket shows only its explanation of what a drift check does; ticket 05 adds the controls.
- The tour step lives in the Context store (ticket 01 added the field) and is not saved.

**Blocked by:** 02

**Status:** resolved

- [x] Six steps with Back and Next; each highlights its map part; clicking a block still works mid-tour.
- [x] Step texts fill in the workspace's numbers (start total, per-layer tokens, memory file count, unindexed count, skill, agent and command counts, MCP server count). Unit-test the step-text builder with a report fixture.
- [x] Step 5 lists health findings; clicking one selects its block.
- [x] Quick tier green.
