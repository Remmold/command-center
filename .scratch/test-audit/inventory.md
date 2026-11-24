Last audit: 0.1.14 (2026-11-24, ticket 02-audit-after-0.1.14, measured on the 0.1.16 code)

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

# 0.1.14

Overdue since 0.1.13 (5 releases after 0.1.8), recorded as the 0.1.14 audit and run on the 0.1.16 code (it includes 0.1.15 and 0.1.16: compact sidebar repo groups, popover clamp, scroll leave-on-wheel). Baseline: 18 UI scenarios, one JSON reporter run on a quiet machine, 88.7 s. Times are per scenario, launch and shutdown included (about 1.5 s each).

**R** = a regression guard the ticket names; its assertions are unchanged.

## UI scenarios, before → after

| # | Scenario (before) | Before | Steps and what they prove | Flags | R | Now |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | accounts › a VS Code profile's folder is offered… | 2.3 s | VS Code profile folder found, Add adopts it logged in, never written, Remove keeps the folder | none | | unchanged (2.0 s) |
| 2 | accounts › VS Code's accounts are adopted in one click… ; repo icon | 4.9 s | suggestion banner, one-click adopt, new chats on Work; icon search, picker, Detect again | the relaunch after writing VS Code's files proved nothing: the app reads them live on every load (`vscodeMatch.current`) | | a page reload instead of a relaunch (3.1 s); assertions unchanged |
| 3 | accounts › Work shows a one-line header per account… | 2.9 s | account sections, waiting badge, repo groups fold, search, Alt+1, Ctrl+Shift+J, Board By account, Settings | the "no Needs you / Running / Idle / In VS Code region" check tested the old status headings, deleted when the sidebar went compact; the next line (the first region is the Personal account) still pins the new layout | | that one check removed (3.0 s) |
| 4 | accounts › a Work chat shows the Work badge and pill… | 6.4 s | pending badge before the process, Work badge and pill, mismatch, Restart on either account | none | | unchanged (6.1 s) |
| 5 | app › zoom… Ctrl+B… kept across a restart | 5.5 s | zoom keys, shell, Settings, View menu, restart; test windows off-screen and never saving their place | none | **R** (window place, off-screen windows, storage flush before quit: the restart keeps the hidden list) | unchanged (5.2 s) |
| 6 | app › auto-update | 6.8 s | Check now; update busy gate with a running chat; the 2.5 s "no restart yet" wait | none | **R** (update busy gate) | unchanged (6.7 s) |
| 7 | chat › a basic chat… | 7.7 s | views, usage strip, Manual start, @ menu, attachments, history, slash menu, model/effort, Shift+Tab, Remote Control, draft over reload, picks while starting | none | | unchanged (7.7 s) |
| 8 | chat › settings picked up at start | 2.2 s | settings.json mode → launch flag; remoteControlAtStartup turns RC on | own launch only because the fixture wrote settings.json; the app reads it at each chat start | | merged: #9 › 5th step, in a new chat (settings.json written mid-test; RC count relative) |
| 9 | chat › slow turns | 4.2 s | send-mid-turn queue; Stop; Run in background; working line | none | **R** (queue) | unchanged, plus steps from #8 and #10 (4.6 s) |
| 10 | chat › a full context | 2.3 s | pie from start, refresh after a turn, /compact on click | own launch only for its script | | merged: #9 › last step, in a new chat on `context` (usage and text counts relative) |
| 11 | chat › tool approval | 3.3 s | 1 / 3 / 2 keys, inbox, question cards | the opening "starts Manual" check repeats #7's; kept, as it is the precondition for the approval prompts | | unchanged (3.1 s) |
| 12 | chat › chat rendering | 6.6 s | thinking, todos, copy, timestamps; scroll-follow under lazy rendering | none | **R** (scroll-follow) | unchanged as the first two steps; #13 and #14 follow (10.8 s for all three) |
| 13 | chat › transcript look | 4.8 s | MCP names, OUT box, compaction, thinking, image path preview | own launch only for its script | | merged: #12 › 3rd step, in a new chat on `look`, read through the visible pane |
| 14 | chat › media tab | 4.0 s | Media tab, tiles, preview, Jump to message, Chat tab keeps scroll | the "no Media button" and "no Media complementary region" checks tested the old media column, deleted when it became a tab | | merged: #12 › last four steps, in a new chat on `media`; the two column checks removed |
| 15 | chat › subagents | 6.5 s | compact Agent rows, Agents tab, live view, still-working bar, stop_task | compact rows are the current behaviour (no nested messages left to test) | | unchanged (6.3 s) |
| 16 | sessions › session history | 3.3 s | title, rename, the Past sessions picker (not the old modal), resume | none: it already opens the picker | | unchanged (3.0 s) |
| 17 | sessions › a VS Code session in Work | 9.4 s | observed-view cut-off with a tall hosted chat mounted behind; badge; follow on append | the hosted chat used the "long" reply, whose 2.5 s pause exists for the scroll-follow guard and proved nothing here (twice: 5 s) | **R** (observed cut-off) | the hosted chat sends "tall…": the same reply without the pause (3.2 s); assertions unchanged |
| 18 | sessions › taking over a VS Code chat | 5.1 s | take-over waits for the turn; the 2.5 s "not resumed yet" wait | none | | unchanged (5.1 s) |

The zoom overflow guard is `e2e/shots/zoom.shots.ts` (untouched, green). The per-turn cost has no UI step left to remove (it went with its code). `processTree` stays as `e2e/processTree.test.ts` and the unchanged `shutdown` in `e2e/harness.ts`. Kept, not cut: the 2.5 s negative waits in #6 and #18, the start delays in #4 and #7, and the script timings behind the scroll-follow and subagent steps.

New in `e2e/harness.ts`: `useScript(app, name)` sets `FAKE_CLAUDE_SCRIPT` in the main process, so later chats in the same launch play another script (the app passes its environment to each CLI it starts). Shutdown is untouched.

## Unit tests

| Removed | Why | Still covered by |
| --- | --- | --- |
| `chatMediaStore.test.ts` › a newly opened chat starts on Chat | exact duplicate: same input and output | the next test, "toggling switches only that chat", asserts an untouched chat shows Chat |

Checked and kept: every export a unit test imports has a production caller (tests of deleted code went with it: `smoke.test.ts`, `hookScript.test.ts`, `subagentTranscript.test.ts`). The media column's width migration (`dropSavedPanelWidth`) still runs at load, so its tests stay. The sidebar's Needs you / Running / Idle / In VS Code grouping still feeds the account sections and the Dashboard, so `sessionList.test.ts` stays. The extension-wording constants stay, as in 0.1.7.

## Before / after

| Measure | Before (0.1.16) | After |
| --- | --- | --- |
| UI scenarios | 18 | **14** |
| UI time, quiet machine (`pnpm e2e:gate`, JSON total) | 88.7 s (85–89.6 s) | **71.4 s, 70.3 s** (green twice, no rerun) |
| Unit tests | 1,023 (+1 skipped) in 110 files | **1,022** (+1 skipped) in 110 files |
| Quick tier (`pnpm quick`, wall) | 9.4 s | 9.3 s |
| Perf guard and zoom shots | green | green (4 passed, 1.8 min) |
| Named regression guards | 9 | **9, assertions unchanged** |
