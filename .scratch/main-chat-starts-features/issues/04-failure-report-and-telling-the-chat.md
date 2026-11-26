# 04: A failed or finished start is reported exactly, and the chat is told

**What to build:** after Go, the app tells the chat in one short message what happened, so the chat confirms a success in words and says where to continue, or reports a failure and waits. A failure names the step and what is left behind. Spec: user stories 16, 18, 19; Decisions "Report". ADR 0009.

**Blocked by:** 02

**Status:** resolved

- [x] A failure message names the failed step and what remains (worktree, branch, folder, workspace entry), read from the rollback's own results (what it could not remove), never assumed. A clean rollback says nothing was left behind.
- [x] A session that does not start after the worktree was made undoes the feature as today, and the message says what the undo left, if anything.
- [x] After success or failure the app sends the chat one short message beginning `[Command Center]`; no retry happens on its own. The chat's instructions (ticket 01) say to confirm a success in words and where to continue, and to report a failure and wait.
- [x] That message counts as a message after the card, so the used card is no longer live (story 10) and reads Started or Superseded per ticket 01.
- [x] Vitest: left-behind lists for a failed worktree add, a failed install, a failed brief write, a failed session start and a rollback that itself fails; the message text for success and failure.
