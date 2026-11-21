# 04: New session picker, close and past sessions, split chat

**What to build:** starting, closing and resuming sessions from the Work list, and watching two chats side by side.

**Blocked by:** 03

**Status:** resolved

- [x] **+ New session** above the list opens a searchable workspace picker with "Add workspace…" at the bottom; choosing one opens a new chat in that workspace (on its account profile)
- [x] Row menu → Close stops the session's process and removes it from the list (it stays resumable from Past sessions)
- [x] The list's menu has "Past sessions…" that asks for a workspace and opens today's past-sessions list for it; resuming opens the chat in Work
- [x] Ctrl+click on a row, or a split button in the chat header, opens a second chat beside the first; never more than two. Opening a third replaces the one not focused. The split pair is remembered across restarts. Each half has its own header and input.
- [x] Ctrl+J and Needs you clicks open the target in the focused half
