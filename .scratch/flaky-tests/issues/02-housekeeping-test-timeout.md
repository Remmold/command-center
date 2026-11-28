# 02: The merged-worktrees housekeeping test times out when the machine is busy

**What to build:** the housekeeping test for removing merged worktrees runs well under its 5 s limit even when the machine is busy, so it stops blocking commits.

**Blocked by:** None (can start immediately)

**Status:** needs-triage

Seen on 2026-11-28: `src/main/features/housekeeping.test.ts > removing merged worktrees > removes only clean, merged worktrees no feature owns, skips the rest with reasons, and never forces` ran 5346–5630 ms under load, where it takes about 1 s alone. It came in with `981402a`. It blocked pre-commit runs twice during the model3d flow.

- [ ] What makes it slow under load is found (real git runs, real disk work)
- [ ] It runs under 1 s with the quick tier under load, keeping its default limit
