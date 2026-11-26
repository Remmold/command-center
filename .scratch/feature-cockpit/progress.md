Base commit: 83c8b2d1ffdf20eee00aeb76e24b9908d9db5f45 (main, release 0.1.31)
Branch: feat/feature-cockpit
- 01 resolved: New feature makes the worktree on the source account and starts a /flow feature session shown under Features — 591d5da
- 01 review fixes: refuse a removed account, "workspace removed" note, one reload helper — e376fa1
- 02 resolved: Features rows show stage, tickets done/total, account and session status read from files; Completed group; feature sessions count in Needs you and jump-to-next — 922eac7
- 02 review fixes: restart re-host via saved Claude session id, one comment, stage helper, transcript-unreadable note, stageService tests — 5cd4cf1
- 03 resolved: per-workspace preview config (shared reader, store, Settings → Preview page), New feature runs the install command with clean-up on failure — dce36c2
- 03 review fixes: shared env/killTree, tolerant store, Settings load guard — dce36c2 -> b61ad9a
- 04 resolved: ports in 4100-4999 reserved per feature and kept, servers boot as terminals with Starting/Ready/Failed, Start/Stop/Retry on the row, install on the feature account — 1ae776b
- 04 review fixes: a Stop during a relaunch no longer leaves an untracked server; a restart no longer fails sibling servers on the old terminal's exit; the ready check also sees IPv6-only localhost listeners — ceb631e
- 05 resolved: test steps checklist with Pass/Fail marks and Fail notes in a results file, counter in the Test tab and last result on the feature row — 693b82c
- 06 resolved: Test button boots the servers and opens the test pair (test flow + sandboxed preview browser on its own storage partition, F6 flips); ports kept per server name; missing workspace and ready-wait errors handled — 1493528
- 08 resolved: Complete (servers stopped and forgotten, pair and browser store closed, ports freed, marked Completed), Re-open with fresh ports, Remove worktree refused on unmerged work; UI scenario 17 of 20 — a815a58
- 09 resolved: feature digest (pure renderer, change-only debounced writer in userData, wired to stage/server/session/usage/profile changes) — 78ea9cd
- 10 in-progress: main chat pinned above Work, tools restricted to Read/Grep/Glob with deny-by-default approvals, account picker in Settings; resume-after-restart not yet seen live — 6ab19dd
- 07 in-progress: Set up preview button in Settings starts a session that writes a draft JSON file the editor loads unsaved; no-browser outcome; not yet seen live � 06aefab
- 11 resolved: /flow uses the given feature worktree and name; /test-flow writes the checklist form (needs a 'Preview browser: yes' prompt line the app does not send yet) — b2c44e5
- 11 follow-up: first prompt carries "Preview browser: yes" when the workspace has a preview config — dc2aa24
- gate fixes A: ticket 07 repaired (result applied before the setup ends, folder split on either separator, empty first write waits, 10-minute give-up, stale drafts swept, unreviewed draft kept and offered); still not seen live, ticket 07 stays in-progress — 87e9726
- gate fixes B: main chat read boundary resolves real paths (.. / junctions / short names / case), refuses climbing or absolute Glob and Grep globs and calls with no path; digest in its own folder (old file removed at start); setting sources cut to project for the chat (real CLI run accepted the flag; user-level Read(*) allow rules no longer load, and --tools already removes every other built-in, so the handler is the only gate left for Read/Grep/Glob) — PENDING
