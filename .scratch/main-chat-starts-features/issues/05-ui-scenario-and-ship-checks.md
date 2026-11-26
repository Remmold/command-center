# 05: One UI scenario covers plan, card, Go and the new session

**What to build:** the end-to-end proof on the fake CLI, and the test-flow for what only a person can judge. Spec: "Testing Decisions (seams)"; user stories 1, 8, 13–16, 21.

**Blocked by:** 03, 04

**Status:** ready-for-agent

- [ ] One new scenario in the UI suite: the fake CLI main chat replies with a proposal; the card appears with the four fields; Go starts the feature; `brief.md` exists in the new worktree; the new session's first prompt names it; the main chat's process was still given only the read tools. `pnpm e2e:count` reads 18 of 20 and the suite stays under 200 s.
- [ ] The fake CLI can be told to reply with a given proposal (script or variable, documented in `tools/fake-claude/README.md`).
- [ ] A test-flow document for the manual half is written with the `test-flow` skill: a real main chat on Haiku writes a proposal in the block format on its own; the card looks right; Open session lands in the feature (Lane 2).
