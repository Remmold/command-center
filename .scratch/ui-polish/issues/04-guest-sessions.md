# 04: Guest sessions: move sessions into other accounts' groups

**What to build:** a session can be dragged, or moved with the "Move to group" menu, into an own group or Ungrouped under any account. A **guest session** keeps running on its own account (its workspace's), and its row carries a small tag naming that account. Spec: `.scratch/ui-polish/spec.md` (user stories 18–27, "Cross-account placement").

**Blocked by:** 03

**Status:** in-progress

- [x] `moveChat` moves a chat id from wherever it is placed (any account's lists) into a target group of any account. The layout becomes the single source of truth: an id sits in at most one list across all accounts.
- [x] `placeChats` / `placeAccount` treat an id placed under any account as placed, so they don't add it again as unplaced under its own account. The 30-day prune and the "known/seen" bookkeeping must work on guest ids too. A guest that closes and resumes, or is taken over, comes back to its guest spot.
- [x] Drop targets accept a chat from any account (the `d.group === profileId` check is dropped for chats). Groups still only move within their own account.
- [x] The "Move to group" menu lists the own groups and Ungrouped of every account, under each account's name. The current account comes first.
- [x] `moveChatStep` and `moveChatToNextGroup` stay inside the account section the chat sits in. For a guest, that is the host account's section.
- [x] A row is a guest when the section's account differs from the row's account (`accountOf(row.workspace.profileId)`). The row then shows a small tag with that account's short name in its account colour. The tag is gone once the session sits under its own account again, whether moved back or because its workspace switched to that account.
- [x] Nothing about the session's process, its account or its workspace changes when it moves. Every per-account count (Dashboard, title bar strip ring, Board, approval inbox, tray) keeps using the workspace's account, not the sidebar section.
- [x] Unit tests at the existing seams (`sidebarGroups.test.ts`, `sessionList.test.ts`): guest moves both ways, one place per id across accounts, placement doesn't duplicate guests, prune and resume keep guest spots, keyboard moves stay in their section, guest detection. Extend an existing UI-suite sidebar scenario only if it is cheap; no new scenario.
- [x] When a new chat lands in a folded Ungrouped or a folded account section, that section and Ungrouped unfold so the row can scroll into view.
