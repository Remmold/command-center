# 13: Chat-first Sessions layout

**What to build:** the Sessions view becomes chat-first. The chat fills the workspace area, the IDE panels hide behind one toggle, and shells open only on demand.

**Blocked by:** 04, 05

**Status:** resolved

- [x] The workspace area shows the chat full width
- [x] A single toggle (button + shortcut) slides in the IDE panels (file tree, editor, git pane) as they are today; it is closed by default and remembered per workspace. The shortcut must not clash with Ctrl+1/2 (views), Alt+1..9 (chat tabs) or Ctrl+J (next waiting).
- [x] The bottom shell strip is gone; a shell opens as a tab or drawer on request, through an action ticket 08's account login can reuse
- [x] The apps dashboard and in-chat diff cards are unchanged
- [x] Nothing is deleted: the panels' code and Monaco stay
