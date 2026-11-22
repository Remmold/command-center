# 01: Zoom like VS Code, and a closable session panel

**What to build:** Andreas finds the text and icons too small, and wants the left session panel to be closable. Decided 2026-11-22:
- one zoom for the whole window, as in VS Code, starting at **110%**;
- **Ctrl+B** hides and shows the session list, as VS Code's sidebar does;
- the file tree, editor and git panels move to **Ctrl+Shift+E**, VS Code's Explorer key.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] **Zoom keys:** Ctrl+= (and Ctrl++) zoom in, Ctrl+- zooms out, Ctrl+0 resets. They work on any keyboard layout, matched by position where needed, like the existing shortcuts. They work everywhere in the app, including while typing in the prompt box, and are not swallowed by the terminal.
- [x] **Zoom setting:**
  - Use Electron `webContents.setZoomLevel`, with VS Code's steps: each step is a zoom level of ±1, which is about ±20%.
  - Settings → General gets a **Zoom** row showing the current percentage, with − / + / Reset.
  - The level is remembered across restarts and updates.
  - The first start after this change uses **110%**: a fresh setting or one that was never set. A level the user already set is kept.
  - The tray, notifications and the native menu are unaffected.
- [x] **Session panel:**
  - **Ctrl+B** toggles the left session list (Work view). A small collapse button sits on the panel's header row, and a thin strip or icon brings it back.
  - The state is remembered.
  - The chat gets the freed width.
  - Ctrl+Shift+J still opens a waiting chat while the list is hidden, and Alt+1..9 still pick rows from it, even though it isn't visible.
- [x] **Shortcut moves:**
  - The file, editor and git panels (today's `toggleIdePanels`) move to **Ctrl+Shift+E**.
  - Update the shortcut map, its no-clash test, tooltips, the README and the test-flow page.
- [x] **Layout at the new zoom:** check the app at 110%, 125% and 150% at 1440×900. Nothing may clip or overflow: the top bar's account and usage pill, the Work list rows, the Board columns and the Settings dialog. Fix any overflow.
- [x] **Perf guard:** after `pnpm build`, `pnpm exec playwright test -c e2e/shots/playwright.config.ts perf` stays green.
- [x] **Tests:**
  - the pure zoom model (steps, limits, default 110%, keeping a saved level);
  - the shortcut map with the new keys and no clashes;
  - an e2e that zooms in and out and restarts (the level is kept), and Ctrl+B hiding and showing the session list.
