# 05: Ask before quitting with running terminals

**What to build:** a real quit with terminals still running asks first, so a dev server isn't killed by mistake. Spec: `.scratch/processes-terminal/spec.md` (user story 26).

**Blocked by:** 01

**Status:** resolved

- [x] On a real quit (the existing quitting path, not close-to-tray) with any running terminal, show a native confirm: "N terminals still running: quit anyway?". Cancel aborts the quit. Then kill all.
- [x] Closing the window to the tray doesn't ask.
- [x] Every quit path counts: tray Quit, the app menu, and the updater's restart-to-install. The updater's restart asks too; if that clashes with how the updater works, stop and report it.
- [x] The UI suite's own app shutdown must never hang on the dialog. Tests close the app with no running terminals, or a test-only bypass is used; check how `e2e/harness.ts` closes the app.
- [x] Unit test the decision (ask or not, and the "N terminals" text) as a pure function over the running count and the kind of quit.

## Comments

- The confirm sits at the entry points (tray Quit, File → Exit, the update controller before `quitAndInstall`), not in `before-quit`: electron-updater spawns the installer before it quits, and the other `before-quit` listeners (allowWindowClose, holdQuit's closeAll) can't be stopped once one fires. The UI suite's `app.close()` calls `app.quit()` directly, so it never sees the dialog.
- Running sessions and terminals now make one question; the update restart asks about terminals only (the update pill already asks about busy sessions). The auto restart also asks, so with a terminal running it waits on the dialog and, if cancelled, installs on the next quit or click.
