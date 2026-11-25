# 02: Chat history saved in one file per session, off the UI thread

**What to build:** hosted sessions' chat history is saved by the main process in one file per session, and the window only sends what changed; typing no longer stalls while sessions run tools. Every chat still shows its full history from the first frame after a restart. Spec: `.scratch/typing-lag/spec.md` (Implementation Decisions: chat history store, changes not snapshots, chat items store, startup); ADR `docs/adr/0003-chat-history-in-files-per-session.md`.

**Blocked by:** 01

**Status:** resolved

- [x] Main-process chat history store, modelled on the sidebar groups store: one file per hosted session (pane id) in a folder under the app's user data folder. Load all sessions' history; apply a batch of changes for one session; delete a session. Writes for one session happen in the order they came. A file that cannot be read yields an empty history for that session and does not throw at load.
- [x] The renderer never serialises a whole session or the whole store. Change kinds follow the chat items store's actions: append items; replace an assistant item by id (the result of joining a block to its message); set a session's items (whole list, rare: take-over, resume, legacy paths); clear; delete. The main process appends change records to the session's file (append-only log), so a run never re-serialises a whole session; it compacts a session's file to its current items when loading it. Sends may be batched per animation frame or short interval in the renderer; the main side may batch disk appends, with at most ~1 s of changes unwritten.
- [x] The chat items store keeps its actions and its in-memory shape (`items` by pane id), so every reader (chat view, cost estimate, Media tab, approval inbox, session header, Dashboard, project views, Remote Control, take-over, session navigation, sent thumbnails) is untouched. It drops zustand `persist` and localStorage; each action also emits its change record to the history bridge. The bridge is injectable so the store is testable without Electron.
- [x] Startup: the renderer loads all sessions' history from the main process before chats render, so every chat shows its history from the first frame as today. The saved-scroll restore logic keeps working unchanged.
- [x] Deleting a session deletes its file; clearing a chat stays clear after a restart.
- [x] Tests, seam 1 (Vitest, temp dir; prior art: the sidebar groups store test): saved changes reload as the same items after a fresh store is created; changes apply in order; replace-by-id joins as the renderer does; delete removes the file; a corrupt or truncated file loads as empty for that session only; a load compacts the file.
- [x] Tests, seam 2 (Vitest, fake bridge): each action emits the matching change record; no action writes to localStorage.
- [x] Ticket 01's check: the tool-call scenario passes (no key over 50 ms and p90 under 20 ms); record the after numbers in `.scratch/typing-lag/baseline.md`. If the streaming scenario is still red, note it for ticket 04.
- [x] The e2e specs that rely on history surviving a restart still pass (run just those).
- [x] Until ticket 03 lands, existing localStorage history is left untouched (not read, not deleted).
