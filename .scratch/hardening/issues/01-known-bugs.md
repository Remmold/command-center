# 01: Fix the bugs found while building the harness and parity

**What to build:** fix the bugs found tonight, each with a test that fails first. The fake CLI (`tools/fake-claude/`) and the Electron smoke suite (`pnpm e2e`) are the tools.

**Blocked by:** None (can start immediately)

**Status:** blocked — every bug fixed except the e2e worker crash (0xC0000409, about 1 run in 7), which needs its own diagnosis

- [x] A permission-mode change made before the chat's process exists only changes the screen; the CLI never receives it and no error shows. Fix: store it and pass it as `--permission-mode` at spawn (and send `set_permission_mode` if the process appears later), and surface failures from `set_permission_mode`/`apply_flag_settings` in the UI.
- [x] New sessions start in "Edit automatically" (acceptEdits). The extension starts in the mode from the user's settings (`permissions.defaultMode`), else Manual (`default`). Mimic it: read the effective default from the user settings for the session's profile; Manual when unset. Existing sessions keep their stored mode.
- [x] Under the fake CLI (`CC_CLAUDE_BIN` set), the app reads the temp `CLAUDE_CONFIG_DIR` for the Default profile but the CLI it launches gets no `CLAUDE_CONFIG_DIR` — make them agree (pass it through in that mode), so decision 16 holds.
- [x] The fake CLI's interrupt doesn't clear queued user messages; match the real CLI's behaviour (check with a control-only or one-line Haiku probe).
- [x] Any bug the smoke suite or an agent logged in `.scratch/overnight/decisions.md` or the progress files as "for hardening". (None were logged; the only one found is the e2e flake below.)
- [ ] E2E flake: "slow turn › Stop sends interrupt" once failed at 0 ms during launch in a full run (passed alone and on rerun). Find the launch race in `e2e/harness.ts` and make it deterministic; prove with ~5 repeated full runs.
  - Not fixed. It is the Playwright worker itself dying: "worker process exited unexpectedly (code=3221226505)" (0xC0000409), reported on the next test at 0 ms. Seen in 2 of 13 full runs (on tests 2 and 4), never in 120 launch-only tests in a row, no Windows error event or crash dump. Async teardown with a wait for the whole app tree to exit did not stop it, so that change was reverted.
- [x] Each fix has a unit test or an e2e scenario that failed before the fix.
