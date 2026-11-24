# 01: Your own sidebar groups, sorted by dragging

**What to build:** Andreas (2026-11-24): "drag sort my sessions independently of their project, similar to how you could sort chat channels in Snacka." He chose:
- **his own groups, like channel categories**;
- **accounts stay separate**: chats sort within their account.

```
⌄ ● Work · Team                 ████▁▁▁ 45%

   ⌄ Today                              ⋮⋮
      [▶] Organization multi invite    ⋮⋮
      [N] Swish implementation         ⋮⋮
   ⌄ Waiting on review                  ⋮⋮
      [▶] PR 1216 by anettkan          ⋮⋮
   ⌄ Ungrouped
      [▶] Customer review extraction   ⋮⋮
```

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] **Groups replace the automatic repo groups** (0.1.16).
  - On first start after this change, seed each account's groups from its current repo groups (same names and order, same members, same fold state), so nothing visibly moves.
  - After that, the groups are the user's own: create, rename, delete and reorder them.
  - Deleting a group moves its chats to **Ungrouped**, never deletes them.
  - Every row keeps its repo icon.
- [ ] **Dragging:**
  - Drag a chat by its row (a grip shows on hover) to any position in any group within the **same account**. Dropping onto another account isn't allowed; show the not-allowed cursor.
  - Drag a group header to reorder groups.
  - Use the existing `SortableItem` primitive from Settings → Workspaces where it fits.
  - Keyboard: Alt+↑/↓ moves the focused row, Alt+Shift+↑/↓ moves it to the next or previous group.
- [ ] **New chats** land at the top of an **Ungrouped** group, pinned first in the account. Ungrouped hides when empty. A resumed or taken-over chat keeps its place if it had one.
- [ ] **Group actions:** "New group" from the account header's menu and the row menu ("Move to group ▸", "New group from this chat"), plus Rename and Delete on the group header menu. Groups fold; folded groups show their count and the "N waiting" pill, as today.
- [ ] **Waiting chats:** a manual order means a waiting chat no longer jumps to the top. Keep the amber edge, the folded-group "N waiting" pill and Ctrl+Shift+J, so they're never missed.
- [ ] **Storage:** in app data (`sidebar-groups.json`, written atomically), per account: groups (id, name, folded) and the ordered chat ids per group. Chats are keyed by their stable session or pane id. Ids of deleted or closed chats are pruned lazily.
- [ ] **Search** still filters across groups, showing matching rows under their group headers.
- [ ] **Tests:**
  - pure: seeding from repo groups, move and reorder operations, the account-boundary refusal, new-chat placement, group delete moving chats to Ungrouped, pruning, keyboard moves;
  - **no new UI scenario**: extend the existing sidebar scenario in `e2e/accounts.spec.ts` to drag a chat into another group, reorder a group, and refuse a cross-account drop. Use Playwright's mouse; check the order persists after reload.
  - The zoom check covers the grips at 150%.
  - Gate as usual.
