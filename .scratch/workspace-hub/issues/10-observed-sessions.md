# 10: Observed VS Code sessions

**What to build:** VS Code sessions running in Andreas's workspaces appear as observed sessions. They are read-only, marked "in VS Code", and render their conversation as it updates.

**Blocked by:** 05, 08

**Status:** ready-for-agent

- [ ] For each workspace, list transcripts tagged `entrypoint: claude-vscode` that changed in the last 30 minutes and aren't hosted sessions, read from the workspace's profile folder
- [ ] The one being viewed is tailed and new lines render through the existing chat item rendering, read-only (no input, no approvals)
- [ ] An observed session is Live if its transcript changed in the last 2 minutes, otherwise Quiet; one quiet for over 30 minutes drops off the list
- [ ] Tests for the listing and Live/Quiet rule against fixture transcripts
