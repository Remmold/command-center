# 11: `/flow` and `/test-flow` write the new checklist for features

**What to build:** the global flow and test-flow skills use the given worktree and feature name and write the short checklist when the workspace has a preview config. Spec: `.scratch/feature-cockpit/spec.md` (user stories 55, 56; "Global skills"). Edits files **outside this repo** in `~/.claude/skills`; Andreas approved this in the grilling.

**Blocked by:** 01, 05

**Status:** resolved

- [x] `/flow`, when its first prompt gives a worktree and a feature name, works in that worktree and writes under its `.scratch/<feature>`; it makes no worktree of its own.
- [x] The test-flow skill writes the feature's test steps in the checklist form of ticket 05 (one `- [ ]` line per step: where to go, what to do, what should be seen; no commands) when the workspace has a preview config, and today's format otherwise.
- [x] Neither skill changes anything for a session that was not started through New feature.
- [x] The change is two small diffs; they are shown in the final message, not hidden.
- [x] Check by dry reading the skills against ticket 05's parser and ticket 01's first prompt; no real Claude run.
