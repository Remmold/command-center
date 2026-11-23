Last audit: 0.1.7 (2026-11-23, ticket 01-trim-the-suites)

# Test audit inventory

Baseline: release 0.1.7 (the ticket's 852 unit tests in 93 files were counted before the last 0.1.7 merges; 884 in 97 files on the 0.1.7 tag), one JSON reporter run of the 43 UI scenarios in `e2e/smoke.spec.ts` (168 s, quiet machine).
"Unit" names the unit test file that already pins the scenario's rule. Every scenario was kept or merged and none was deleted outright: each one also proves app wiring (IPC, the CLI protocol through the fake's log, or what is on screen) that no unit test reaches. The media column is already gone (0.1.7 replaced it with the tab; its scenario was rewritten then), so there was nothing left to delete for it.

**R** = guards a bug that reached Andreas; its assertions are unchanged.

## UI scenarios, before → after

| # | Old scenario (smoke.spec.ts) | Before | Proves | Unit | R | Now in |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | a new session streams the fake reply | 2.5 s | reply streams; CLI runs on the profile's config dir | statusReducer, childEnv | | chat: *a basic chat* › text and PDF files (the reply to that prompt; config dir checked there) |
| 2 | Ctrl+1/2/3 switch Dashboard, Work and Board | 1.7 s | view keys and tabs | shortcutMap, views | | chat: *a basic chat* › Ctrl+1/2/3 |
| 3 | the usage strip shows the fake account and its weekly bar | 1.7 s | usage probe → strip meters | usageModel, usagePace | | chat: *a basic chat* › the usage strip |
| 4 | Shift+Tab sends set_permission_mode | 2.1 s | key → control request | permissionModes | | chat: *a basic chat* › Shift+Tab |
| 5 | a model and effort change send apply_flag_settings | 2.2 s | picker → control request, notices | modelPicker | | chat: *a basic chat* › a model and effort change |
| 6 | an unsent draft survives the window reloading | 2.5 s | draft kept across reload | restoreSnapshot | | chat: *a basic chat* › an unsent draft |
| 7 | ↑/↓ recall earlier prompts and Ctrl+J adds a line | 2.4 s | history keys in the textarea | promptHistory | | chat: *a basic chat* › ↑/↓ recall (reply counts now relative) |
| 8 | the slash menu sends on Enter, inserts with a hint on Tab, and opens the app's own UI | 2.4 s | menu keys, /model /context /usage dialogs | slashMenuModel, contextUsage | | chat: *a basic chat* › the slash menu ("only /compact was sent" now checked on the texts sent during the step) |
| 9 | the mode a new session starts in › is Manual when settings.json sets no default mode | 2.2 s | launch flag `default` | userSettings | | chat: *a basic chat* › starts Manual (also asserted at the start of *tool approval*) |
| 10 | … › picked while the process is still starting, reaches the CLI | 4.8 s | mode picked before the process exists | launchGate | | chat: *a basic chat* › last step, in a second chat (start delay 2.0 → 2.5 s since two picks happen before the process is up; "not initialized yet" counts only processes started in the step) |
| 11 | … › with permissions.defaultMode › is the settings' mode | 2.2 s | settings.json mode → launch flag | userSettings | | chat: *settings picked up at start* |
| 12 | slow turn › Stop sends interrupt and shows Interrupted | 2.3 s | Stop → interrupt, Interrupted, editable | interrupt | | chat: *slow turns* › Stop sends interrupt (counts relative: 2nd interrupt) and again at the end of › the working line |
| 13 | slow turn › a prompt sent mid-turn shows queued and starts after Esc from the transcript stops the turn | 2.3 s | send-mid-turn queue | heldPrompts | **R** | chat: *slow turns* › first step, assertions unchanged, on a fresh chat |
| 14 | working indicator › the working line shows while a turn runs and goes when it ends and after Stop | 3.9 s | working line on/off | workingSpinner | | chat: *slow turns* › the working line (long-job count relative) |
| 15 | working indicator › a running Bash call blinks, offers Run in background … | 2.2 s | background_tasks for the call | runInBackground, runningCalls | | chat: *slow turns* › a running Bash call |
| 16 | auto-update › an update that arrives mid-turn waits for the chat … | 6.7 s | update busy gate | busyGate, restartPlan, controller | **R** | app: *auto-update* › second step, assertions unchanged, on a fresh chat |
| 17 | auto-update › Settings → General shows the version and the last check, and Check now checks again | 1.8 s | Check now → updater | controller, updateLabels | | app: *auto-update* › first step |
| 18 | a full context › the context pie … | 2.3 s | pie, refresh, /compact | contextUsage | | chat: *a full context* (unchanged; its script is the only one with a full context) |
| 19 | tool approval › 1 approves and the tool runs | 2.3 s | key 1 → allow | approval, approvals | | chat: *tool approval* › 1 approves |
| 20 | tool approval › 3 with feedback denies and logs the feedback | 2.2 s | key 3 → deny with feedback | approval | | chat: *tool approval* › 3 with feedback (reply checked as the 2nd) |
| 21 | tool approval › "allow for this session" skips the second prompt | 2.4 s | setMode acceptEdits, no 2nd prompt | approval | | chat: *tool approval* › allow for this session (reply the 3rd, prompts 3 not 1, Write done 2 → 3) |
| 22 | chat rendering › thinking, the todo checklist, copy buttons and timestamps … | 3.6 s | rendering + clipboard | thinking, todos, messageTime | | chat: *chat rendering* › first step |
| 23 | chat rendering › scrolling up holds the view while output arrives; sending follows again | 5.3 s | scroll-follow under lazy rendering | scrollFollow | **R** | chat: *chat rendering* › second step, assertions unchanged |
| 24 | mentions › the @ menu lists folders but not ignored files … | 3.1 s | ripgrep listing → menu | mentionSearch, mentions | | chat: *a basic chat* › the @ menu |
| 25 | mentions › text and PDF files go as document blocks … over-long prompt refused | 2.3 s | content blocks sent, 50k limit | attachments | | chat: *a basic chat* › text and PDF files |
| 26 | session history › Claude names the session, a rename reaches the CLI … | 3.2 s | title, rename, past sessions, resume | sessionTitle, pastSessions, local-sessions | | sessions: *session history* (unchanged) |
| 27 | accounts from an existing folder › a VS Code profile's folder is offered … | 2.1 s | adopt, never write, Remove | adopt, vscodeProfiles, profiles | | accounts: own scenario (unchanged) |
| 28 | accounts VS Code uses › the Dashboard points at the suggestion … | 4.7 s | follow VS Code's account per workspace | vscodeMatch | | accounts: *VS Code's accounts are adopted…* › first step |
| 29 | transcript look › an MCP call reads "Server [tool]" … | 7.0 s | MCP names, OUT box, compaction, image preview | mcpTool, compaction, fileLinks | | chat: *transcript look* (unchanged) |
| 30 | media tab › the Media tab replaces the transcript … | 4.0 s | Media tab, preview, Jump to message | chatMedia, chatMediaStore | | chat: *media tab* › first three steps |
| 31 | media tab › the Chat tab keeps its scroll position … | 2.6 s | transcript not remounted, follows | scrollFollow | | chat: *media tab* › last step (reuses the 4 "more" replies) |
| 32 | subagents › a subagent's messages show under its Agent call … | 2.5 s | nesting, transcript dialog | subagents, subagentTranscript | | chat: *subagents* › first step |
| 33 | subagents › Stop agent sends stop_task … | 2.4 s | stop_task with task id | subagents | | chat: *subagents* › second step (the 2nd Agent call) |
| 34 | Remote Control › /remote-control turns it on and shows the link … | 2.4 s | remote_control on/off | remoteControl | | chat: *a basic chat* › /remote-control ("no prompt sent" now checked on the texts sent during the step) |
| 35 | Remote Control › turned on while the process is still starting … | 4.4 s | RC before the process exists | remoteControl, launchGate | | chat: *a basic chat* › last step ("turned on once" counts the requests sent in the step) |
| 36 | Remote Control › with remoteControlAtStartup › a new chat turns it on by itself | 2.2 s | auto-enable from initialize | remoteControl, initialize | | chat: *settings picked up at start* |
| 37 | a VS Code session in Work › shows its header and its whole last message … | 17.9 s | observed-view cut-off | transcriptItems, tail | **R** | sessions: own scenario, assertions unchanged; VS Code sessions and the badge reread every 0.5 s instead of 10 s |
| 38 | taking over a VS Code chat › waits for the turn to end … | 14.9 s | take-over waits for the turn | takeOver, turn | | sessions: own scenario (unchanged), listed every 0.5 s |
| 39 | grouped by account › Work shows a section per account … | 3.7 s | grouping in Work, Board, Settings | repoGroup, order, sessionList | | accounts: own scenario (unchanged) |
| 40 | repo icons found in the repo › the app icon is chosen automatically … | 2.6 s | icon search, picker, Detect again | projectIcons, rankIcons, repoIdentity | | accounts: *VS Code's accounts are adopted…* › second step |
| 41 | zoom and the session list › starts at 110% … kept across a restart | 4.9 s | zoom keys, shell, Settings, View menu, restart | zoom | | app: *zoom … and both are kept across a restart* |
| 42 | zoom and the session list › Ctrl+B hides and shows the session list … across a restart | 4.9 s | list toggle, Alt+1, Ctrl+Shift+J, restart | shortcutMap | | app: same scenario, one restart checks both |
| 43 | the account a chat runs on › a Work chat shows the Work badge … | 11.7 s | badge, pill, mismatch, Restart on | chatAccount, accountColors | | accounts: own scenario (unchanged) |

The VS Code kill (`processTree`) regression stays as `e2e/processTree.test.ts` (unit) and the unchanged `shutdown` in `e2e/harness.ts`, which every scenario runs.

## What changed besides the merge

- `e2e/smoke.spec.ts` is split by area into `chat.spec.ts` (9), `sessions.spec.ts` (3), `accounts.spec.ts` (4) and `app.spec.ts` (2); shared constants in `e2e/common.ts`.
- `CC_OBSERVED_REFRESH_MS` (read only on the fake CLI, like `CC_UPDATE_IDLE_MS`) shortens how often VS Code's sessions are listed and how often an observed chat's account badge rereads its live process; the two scenarios that write VS Code files after launch set it to 500 ms. Normal runs keep 10 s for both. Pinned by `src/shared/observedRefresh.test.ts`.
- `delayClaudeStart` can be changed or ended (0) once set; the chat-account scenario ends it after the first start, so its two restarts no longer wait 2.5 s each. `FakeLog.initializedIn` takes an optional start index.
- `e2e/scripts/look.json`: the two thinking blocks take 1 s instead of 2 s (the check is "Thought for Ns", any N).
- Kept, not cut: the 2.5 s "still not resumed / not restarted" waits in the take-over and auto-update scenarios; they are the negative half of each rule.

## Unit tests (light pass)

| Removed | Why |
| --- | --- |
| `toolCall.test.ts` › approval target (2 tests) | tests of dead code: `approvalTarget`'s only caller, `PermissionPrompt.tsx`, was deleted in cce767c; the function went too |
| `views.test.ts` › opens on the Dashboard | restated `DEFAULT_VIEW` = `'dashboard'`; the fallback test still pins the behaviour |
| `smoke.test.ts` › test runner › runs a test | `1 + 1 = 2`, scaffolding from the Vitest setup |

Kept on purpose: the lines pinning `RAN_AHEAD_NOTICE`, `DESTINATION_LABEL` and `NEW_SESSION_TITLE`. They look like copied constants, but they pin wording the app must share with the VS Code extension, which is a rule. No exact duplicates were found. The fake CLI's tests were not touched.

Added: `e2e/budget.test.ts` (budget check, 4 tests) and `src/shared/observedRefresh.test.ts` (6 tests).

## Before / after

Runtimes are from Playwright's JSON reporter (`stats.duration`). The machine was shared with other work during this audit, so the CPU load at the start of each run is given.

| Measure | Before (0.1.7) | After |
| --- | --- | --- |
| UI scenarios | 43 in 1 file | **18** in 4 files |
| UI runtime, quiet machine | 168 s | **86.6 s** (CPU 32%) |
| UI runtime, loaded machine | 157 s (CPU 29%) | 93.7 s (CPU 71%) |
| UI suite green twice in a row | — | yes (final1, final2) |
| Unit tests | 884 in 97 files | **890** in 98 files (−4 removed, +10 added) |
| Quick tier (`pnpm quick`, wall) | 9.3 s | 10.9 s (unchanged within noise) |
| Perf guard and zoom check (`e2e/shots` perf, zoom) | — | green (4 passed, 1.6 min) |
| `pnpm e2e:gate` | — | works: all green without a rerun, budget failed at 121.6 s with the machine at 96% CPU |
| Regression guards (processTree unit test + shutdown, observed cut-off, scroll-follow, send-mid-turn queue, update busy gate) | 5 | **5, assertions unchanged** |
