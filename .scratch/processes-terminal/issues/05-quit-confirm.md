# 05: Ask before quitting with running terminals

**What to build:** a real quit with terminals still running asks first, so a dev server isn't killed by mistake. Spec: `.scratch/processes-terminal/spec.md` (user story 26).

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] On a real quit (the existing quitting path, not close-to-tray) with any running terminal, show a native confirm: "N terminals still running: quit anyway?". Cancel aborts the quit. Then kill all.
- [ ] Closing the window to the tray doesn't ask.
- [ ] Every quit path counts: tray Quit, the app menu, and the updater's restart-to-install. The updater's restart asks too; if that clashes with how the updater works, stop and report it.
- [ ] The UI suite's own app shutdown must never hang on the dialog. Tests close the app with no running terminals, or a test-only bypass is used; check how `e2e/harness.ts` closes the app.
- [ ] Unit test the decision (ask or not, and the "N terminals" text) as a pure function over the running count and the kind of quit.
