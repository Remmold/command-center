# 01: Add an account from an existing Claude folder

**What to build:** in Settings → Accounts you can add an account that uses a Claude config folder that already exists, such as `C:\Users\remmold\.claude-work` from the VS Code "Work" profile. It shows as logged in straight away, with no new login. The app offers the folders that VS Code profiles already use.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Settings → Accounts gains **Use existing folder…** (folder picker) beside the current add-account flow. The new profile stores that path as its `CLAUDE_CONFIG_DIR`. Logged-in state is read from that folder the same way as for other profiles.
- [ ] The app reads VS Code's profiles (read-only):
  - `%APPDATA%\Code\User\settings.json` and `%APPDATA%\Code\User\profiles\*\settings.json`
  - profile names come from `%APPDATA%\Code\User\globalStorage\storage.json` → `userDataProfiles`

  It offers each `claudeCode.environmentVariables` entry named `CLAUDE_CONFIG_DIR` as "Found in VS Code profile <name>". One click adds it. Folders already used by a profile aren't offered.
- [ ] An adopted folder is never modified by the app. No shared-item links are created in it, and nothing is written to it. Removing the profile only forgets it and never deletes the folder; the confirm text says so.
- [ ] Usage bars (top right) and the per-workspace account picker treat it like any other profile.
- [ ] Tests:
  - the pure VS Code settings reader (JSONC with comments and trailing commas; missing files; several profiles);
  - the adopt and delete-safety model;
  - an e2e scenario with a temp fake VS Code settings folder and a temp config dir, run on the fake CLI.

  Never read Andreas's real `%APPDATA%\Code` in tests. Point the reader at a path the test controls.
