# Main chat v2: an orchestrator that acts through cards

Status: ready-for-agent

## Problem Statement

Andreas wants to talk only to the main chat: plan there, and have it start, steer and tidy the work in the other sessions. The main chat built in 0.1.33 refuses ("I can't start features"), sees only the digest (0 features listed while 28 worktrees and 35 unmerged branches exist), never resets, and has no way to reach a feature session.

## Solution

Piece A (ADR 0010, branch `feat/main-chat-v2`): an orchestrator identity, read-only access to every known workspace plus test-flows, a fresh session after each successful Go and from a Reset button.

Piece B: the proposal block becomes one of several **action cards**. The chat writes a block, the app shows a card with exactly what will happen, Andreas clicks, the app acts and tells the chat the outcome in one `[Command Center]` message. The chat keeps Read, Grep and Glob only (ADR 0009).

## Action kinds

| Kind | Card shows | Click does |
| --- | --- | --- |
| `start-feature` | workspace, name, description, brief | today's Go |
| `open-session` | feature name | jumps to that feature's session |
| `send-message` | feature name, the exact message | delivers it as a user message; queued until the session is idle ("Queued, sends when X finishes its turn") |
| `adopt-work` | workspace, branch, path, session found or not | makes it a feature (below) |
| `housekeeping` | the exact list of worktrees / branches | removes merged worktrees, deletes merged local branches, prunes missing worktrees, or completes a feature |

Liveness, read-only old cards and the preflight-before-enable rule are the same as `start-feature` for every kind.

## Decisions

- **send-message targets** feature sessions only (app-made or adopted), named as in the digest.
- **Status feed:** the digest gains per feature a state line (running / waiting on approval / idle) and the first ~300 characters of its last reply. Chat history stays outside the read scope.
- **Open work discovery:** the app scans every workspace (worktrees, unmerged branches, a main checkout on a non-main branch) into a digest section "Open work, not tracked". Nothing is adopted automatically.
- **Adopt:** a worktree becomes a FeatureRecord. If a Claude transcript exists for that folder under the workspace's account, the session resumes it; else a new session is told to read the folder's `.scratch` notes and git log first.
- **Main checkout on a branch:** adopting switches the main checkout back to main and makes a worktree for the branch. Refused when the main checkout has uncommitted changes.
- **Housekeeping is re-checked at click time:** a worktree is removed only if clean and fully merged; a branch is deleted only if fully merged; never a remote branch. The card lists what it skipped and why.

## Tickets (order)

1. Scanner for open work (`feat/open-work-scan`, in progress).
2. Action-card plumbing: block kinds, one parser, one card shell (after Piece A lands).
3. Digest: Open work section and the per-feature status line.
4. `open-session` card.
5. `adopt-work` card, incl. main-checkout move.
6. `send-message` card with the idle queue.
7. `housekeeping` card (four actions).

## Out of Scope

- Messaging ad-hoc (non-feature) sessions.
- Interrupting a running turn.
- Remote branches.
- The chat reading full feature transcripts.
