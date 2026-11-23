# 02: Media is a tab in the chat, not a column beside it

**What to build:** Andreas (2026-11-23), after 0.1.6: "media should be a tab in the chat, so you don't see chat and media at the same time".

**Blocked by:** 01 (shipped in 0.1.6)

**Status:** in-progress

- [x] **Tabs:**
  - Each chat (hosted and VS Code view, in each half of a split) gets two tabs at the top of its content area, under the header: **Chat** and **Media**. The Media tab shows the count, e.g. "Media 3", and hides when the chat has no media.
  - Media replaces the transcript in the same space, using the full width for a larger grid (about 160 px tiles, as many columns as fit).
  - The prompt box stays visible on both tabs.
- [x] **Remove the column:** the side column and its resize handle are gone, and so is the header's Media button. The tab replaces them. The saved column width is no longer used; drop it from storage without breaking older saved state.
- [x] **Switching:**
  - Ctrl+Shift+M switches the focused chat between Chat and Media.
  - Each chat remembers its tab while the app runs. A newly opened chat starts on Chat.
  - The transcript keeps its scroll position and scroll-follow state while hidden. It must not remount: keep it mounted and hidden, or restore through the existing scroll restore, without breaking `useFollowOutput`.
- [x] **Jump to message** switches to Chat and scrolls to the message. The preview arrows, Open externally, Copy path, Reveal in Explorer and the missing-file tile all still work.
- [x] **New media during a turn:** while on the Media tab, new items appear as before. While on the Chat tab, the Media tab's count goes up.
- [x] **Tests:**
  - update the media e2e: open the Media tab, check the transcript is hidden and the grid visible, preview and arrows, Jump to message back to Chat at the right place, Ctrl+Shift+M toggling;
  - add a check that the Chat tab's scroll position survives a trip to Media.
  - The perf guard and zoom overflow checks stay green; the tabs must fit in a narrow split at 150%.
