# 02: Playwright-for-Electron smoke suite on the fake CLI

**What to build:** `pnpm e2e` opens the built app with Playwright's Electron support, using the fake CLI, a temp `--user-data-dir`, a temp workspace and a temp `CLAUDE_CONFIG_DIR`. It walks through the daily actions and asserts on what the user sees and on the fake's log of what the app sent.

**Blocked by:** 01

**Status:** in-progress

- [ ] Playwright (`@playwright/test` with `_electron`) as a dev dependency; `pnpm e2e` builds if needed and runs the suite; not part of `pnpm quick`; documented in CLAUDE.md as part of Ship mode
- [ ] Each test is isolated (own temp dirs), launches the app, and closes it and its process tree afterwards
- [ ] Scenarios:
  - start a session in the temp workspace and see the streamed reply;
  - a tool approval: 1 runs it; 3 with feedback logs the deny payload; "allow for this session" suppresses the second prompt;
  - Shift+Tab logs `set_permission_mode`;
  - a model and effort change logs `apply_flag_settings`;
  - Stop logs `interrupt` and shows "Interrupted";
  - Ctrl+1/2/3 switch Dashboard / Work / Board;
  - the usage strip shows the fake account and its weekly bar.
- [ ] Stable selectors: add `data-testid` attributes where needed, no styling changes
- [ ] The whole suite runs in under 3 minutes on this machine and passes three times in a row
