# 03: Pop-out test-flow window that follows the focused session

**What to build:** a pop-out button on the Test tab opens the test-flow view in its own window, which follows whichever session is focused in Work (spec: `.scratch/test-flow-pane/spec.md`).

Rules (from the spec, word for word):
- **Pop-out window (main process):** at most one, a second `BrowserWindow` loading the renderer in a test-flow-only mode. The main window's renderer publishes the focused Work session's `{ finder result, session title }` to the main process whenever it changes. It does not publish while Work isn't on screen, so the pop-out keeps the last one. The main process forwards it to the pop-out. Its place is saved and restored with the existing window-place code under its own key. Off-screen in test runs, as the main window is. It closes when the app quits and stays when the main window hides to the tray.
- Pressing the pop-out button again while the window is open brings it to the front.
- The pop-out reloads on file changes and keeps its scroll place per file, as the tab does.
- The pop-out follows the focused half when two chats are side by side.

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] Pop-out opens showing the focused session's test flow; a second press focuses it; it remembers its place across restarts.
- [ ] It switches when another session is focused in Work, keeps the last one when Work isn't on screen, and reloads on file changes.
- [ ] Hiding the main window to the tray leaves it open; quitting closes it.
- [ ] The UI scenario is extended: the pop-out opens showing the same file, and switching to a second chat in another workspace switches the pop-out to that workspace's repo-named file (still one scenario, 16 of 20 on this branch).
- [ ] Quick tier green.
