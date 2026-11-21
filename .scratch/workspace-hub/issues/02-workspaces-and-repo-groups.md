# 02: Workspaces grouped by repo in the Sessions sidebar

**What to build:** the Sessions sidebar lists every workspace, with worktrees nested under their repo group. Each row shows a worktree tag and a default letter icon. UI text says "workspace" instead of "project". Saved projects carry over unchanged.

**Blocked by:** 01

**Status:** resolved

- [x] Each workspace gains an account profile id (default "default") and a repo group key; existing saved projects migrate with profile "default"
- [x] The repo group key is derived from git's common directory, so worktrees of one repo share it; a folder outside git is its own group
- [x] A workspace's tag is its folder name with the repo's folder name and leading separators removed, or empty when they're the same (e.g. FS-shard-2 under FantasySurvival → "shard-2")
- [x] A repo group with no chosen icon renders the first letter of its name on a colour hashed from the repo group key
- [x] Tests cover repo group key and worktree tag derivation, using real worktree layouts (FantasySurvival + FS-shard-*)
