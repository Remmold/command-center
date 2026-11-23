# 01: Reopen where it was

**What to build:** Andreas (2026-11-23): "when I update it doesn't automatically open up on the same area of the same screens". The main window always opens at 1400×900 on the primary display, in `src/main/window.ts`. It must reopen exactly where it was: same monitor, position, size, and maximised or full-screen state. That applies after an update restart, a normal quit and a tray reopen.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] **Save:** store the window's normal bounds (`getNormalBounds()`, so un-maximised size survives), `isMaximized()`, `isFullScreen()`, and the display it was on (display id plus that display's bounds and scale factor). Save on move and resize (debounced, about 500 ms), and just before quit or update install. Keep it in a small JSON in user data, written atomically.
- [ ] **Restore:** on window creation, use the saved bounds if they still fit on a connected display.
  - Check the saved display by id first, then any display whose work area contains at least about 100×100 px of the window's title bar.
  - If the monitor is gone or the layout changed, move the window into the primary work area, keeping its size where it fits (clamp it otherwise).
  - Then re-apply maximised or full-screen.
  - The window must not flash at the default spot first: create it with `show: false`, set bounds, then show, keeping today's show logic.
- [ ] **Mixed-DPI monitors:** if the saved display's scale factor differs from the matching display's, keep the saved logical size.
- [ ] **Test mode:** off-screen test windows (`src/main/testWindow.ts`) ignore and never write the saved place.
- [ ] **Tests:**
  - pure unit tests for the restore decision: the same display, a display removed, a moved layout, a window partly off-screen, maximised, and a different scale factor;
  - no new UI scenario (budget ≤ 20, runtime near 90 s). If needed, extend one existing scenario to check that the window's saved file appears after a move. The OS window itself is off-screen in tests.
  - Gate: quick, e2e, perf and zoom stay green.
