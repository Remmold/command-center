# 03: Ungrouped can be moved and sits last by default

**What to build:** in the Work list, Ungrouped can be dragged up or down among an account's own groups like any group. By default it sits last in the account, and existing layouts move it there once. Its position is kept per account across restarts. New sessions still land at the top of Ungrouped, wherever it sits, and the list scrolls them into view. Spec: `.scratch/ui-polish/spec.md` (user stories 14–17, "Sidebar layout").

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] `AccountLayout` gains Ungrouped's position among the own groups, as an index into the group order: `ungroupedAt: number`. A missing value means last. On load, layouts without it get it set to last, once. This is how existing layouts move Ungrouped to the bottom.
- [x] `listsOf` / `accountSections` place Ungrouped at `ungroupedAt` instead of first. Ungrouped is still hidden when empty.
- [x] `moveGroup` can move Ungrouped (its id is `UNGROUPED`), within its own account only. `GroupSection` arms dragging for Ungrouped too. The rule "dropping a group on the Ungrouped header puts it first, never above Ungrouped" is dropped; the drop goes where it lands, as for any group.
- [x] New chats still go to the top of Ungrouped. When one is added, the list scrolls that row into view.
- [x] Alt+arrow and Alt+Shift+arrow moves follow the new order (Ungrouped is no longer always first).
- [x] Unit tests at the existing seams (`sidebarGroups.test.ts`, `sessionList.test.ts`): default last, one-time migration of an old layout, moving Ungrouped, its position surviving a reload, a new chat at the top of Ungrouped wherever it sits.
