# 01: Auto-update from GitHub Releases without interrupting chats

**What to build:** the installed app updates itself from GitHub Releases on `Remmold/command-center`, which is public, so no token is needed in the app. It downloads in the background and never restarts while a chat is busy. It applies the update in one of three ways: when Andreas clicks **Restart to update**, by itself once every chat has been idle for a while, or on quit. After the restart it reopens and resumes the same chats.

**Blocked by:** None (can start immediately)

**Status:** resolved

Decided by Andreas (2026-11-22): source is GitHub Releases; both restart methods (click and automatic when idle).

- [x] **Updater:** `electron-updater` with the GitHub provider (`publish: github` in `electron-builder.yml`). It checks on start and every 30 minutes, downloads automatically, and has `autoInstallOnAppQuit` on. In dev and under the fake CLI or e2e (`CC_CLAUDE_BIN` set), it never contacts GitHub. Tests inject a fake updater.
- [x] **Busy gate (pure model):** a chat counts as busy while a turn is running, a tool approval is waiting, or a queued prompt hasn't started. A chat whose process is alive but idle is not busy. Remote Control alone doesn't make a chat busy.
- [x] **Restart to update:** once an update is downloaded, a small pill in the top bar says "Restart to update". Clicking it restarts at once if nothing is busy. If something is busy, it asks first, naming the busy chats: "N chats are working. Restart anyway?" Cancel is the default.
- [x] **Automatic:** once an update is downloaded and nothing has been busy for **5 minutes** continuously, the app restarts by itself. Any busy moment resets the timer.
- [x] **Restore:** after an update restart the app reopens the same Work layout and open chats, and resumes each with `--resume` when it's next used. Check what is already persisted and only add what's missing. Scroll position and drafts typed but not sent survive.
- [x] **Versioning and release:**
  - A script bumps the patch version (`0.1.N`).
  - `pnpm release` builds and publishes the NSIS installer plus `latest.yml` to a GitHub Release, using `GH_TOKEN` from `gh auth token` at build time only, never stored.
  - The agent must **not** run `pnpm release` and must not publish anything. The conductor does the first real release after the merge.
- [x] **Settings → General:** an "Updates" row with the current version, the last check and a **Check now** button.
- [x] **Tests:**
  - pure busy gate and idle timer;
  - restart-decision model (click while idle, click while busy, auto after 5 minutes, reset on busy);
  - restore model;
  - an e2e scenario with a fake updater: an update arrives while a fake chat runs, so there's no restart; when the chat goes idle the pill shows, and the automatic restart is requested after the timer.

  The timer must be injectable so tests don't wait 5 minutes.
