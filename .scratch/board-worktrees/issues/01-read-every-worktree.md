# 01: The board reads every worktree of an added repo

**What to build:** Andreas (2026-11-24): "can you ensure worktrees are taken into account for the board etc?"

Today `readBoard(workspaces)` (`src/main/board/reader.ts`) reads only added workspaces. It already merges copies of one repo group, with the rule "a ticket is resolved once it is done in any copy". But a **git worktree that isn't added as a workspace is never read**. That includes the temporary worktrees agents use (e.g. `%TEMP%\cc-*`). A ticket an agent is working on in a worktree still shows "ready" until the branch merges, and the Now building strip and Dashboard miss that progress too.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] **Discovery:**
  - For every added workspace, list its repo's worktrees with `git worktree list --porcelain` from the main checkout, through the existing git service, read-only.
  - Include each one that exists on disk and has a `.scratch/` as an extra read-only copy in the same repo group.
  - Skip `prunable` or missing paths, bare entries and duplicates of added workspaces.
  - Cache the list per repo and refresh it when the board refreshes, at most every 30 s.
- [x] **Merging statuses across copies**, per ticket file:
  - show the most advanced status across all copies: resolved > in-progress > blocked > ready > needs-* (keep the existing resolved rule);
  - the card shows **where** that status comes from: a small branch tag (e.g. `feature/x` or the worktree folder name) when it isn't the main checkout;
  - progress notes (`progress.md`, `*.progress.md`) come from the newest copy, as today.
- [x] **Everywhere the board model is used:**
  - Now building and the Dashboard pick this up automatically. Check that they do, and that a feature being built in a worktree shows as building, with that worktree's latest note.
  - A ticket card's "open" action opens the worktree copy's file when that copy decided the status.
- [x] **Sidebar and chats:** chats whose cwd is a worktree already share their repo's group. Check that the chat header shows the worktree tag and the picker lists worktree chats under the repo. Change only what's missing.
- [x] **Safety:** read-only; never run anything in a worktree except `git worktree list` in the main checkout. A worktree under `%TEMP%` is fine to read.
- [x] **Tests:**
  - pure: the status precedence and source tag across copies, missing or prunable worktree skipping, and duplicate skipping;
  - a unit or integration test with a real temporary git repo plus `git worktree add` holding a ticket `in-progress` in the worktree and `ready-for-agent` in main: the board shows in-progress with the branch tag;
  - **no new UI scenario**. Extend the board step only if needed.
  - Gate: quick, `e2e:gate`, perf and zoom.
