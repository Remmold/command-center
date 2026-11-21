# Workspace hub: one window for every Claude session and ticket

Status: ready-for-agent

## Problem Statement

Andreas runs 3–4 Claude Code workspaces at once, today in separate VS Code windows. He finds out a session needs him only by checking each window. Approvals sit unanswered and finished turns go unnoticed. The tickets that the Matt Pocock flow writes into each workspace's `.scratch/` folder can only be followed by opening markdown files one at a time, and worktree copies of the same repo multiply the confusion. Every workspace also shares one Claude login, so one account's rate limit stalls all of them. The command center can host sessions already, but it has no overview, no attention signal, no tray presence, and no way to use more than one account.

## Solution

The command center becomes the one tool he works through, with two views he switches between in the title bar:

- **Sessions**: today's per-workspace view (chat, files, git, shells, apps), now with a sidebar of all workspaces grouped by repo. Each one shows its session status and account profile. A **Needs you** queue lists every waiting session, oldest first, and one key jumps to the next one.
- **Board**: one read-only kanban of every ticket in every workspace's `.scratch/`. It has four columns, a progress bar per feature, and worktree copies merged into one card.

Each workspace uses an **account profile**, a named Claude login of its own. Everything except the login is shared with his Default setup. The app lives in the system tray. Closing the window hides it, a badge counts waiting sessions, and Windows notifications fire when a session needs him. It can start with Windows, hidden in the tray, from a per-user installed build.

## User Stories

### Attention: the chats that need me

1. As Andreas, I want each hosted session to show one session status (Running, Needs approval, Your turn, Idle), so that I know at a glance which ones need me.
2. As Andreas, I want a Needs you queue listing every waiting session across all workspaces, oldest wait first, so that I can work through them in order.
3. As Andreas, I want a keyboard shortcut that jumps to the next waiting session and focuses its input or approval prompt, so that clearing the queue is fast.
4. As Andreas, I want a Windows notification when a session enters Needs approval or Your turn while the window is hidden or that workspace isn't on screen, so that I notice without checking.
5. As Andreas, I want clicking a notification to open the window on that exact session, so that I act on it straight away.
6. As Andreas, I want no notification for a session I'm already looking at, so that I'm not pinged about what's in front of me.
7. As Andreas, I want the tray icon to show a badge with the number of waiting sessions, so that I can see pending work while the window is closed.
8. As Andreas, I want the tray tooltip to name the waiting workspaces, so that I know which one before opening.
9. As Andreas, I want a session's status to keep updating while the window is hidden, so that the badge and notifications are right when I come back.
10. As Andreas, I want a session in Needs approval to return to Running once I approve or deny, so that the queue empties as I work.
11. As Andreas, I want a session that has exited to show Idle, so that I never wait on a dead session.

### Sessions view

12. As Andreas, I want a sidebar listing every workspace, with worktrees nested under their repo group, so that FantasySurvival and its shards read as one family.
13. As Andreas, I want the repo group detected automatically from git, so that I don't maintain the grouping by hand.
14. As Andreas, I want each workspace row to show its account profile and the status of its sessions, so that the sidebar is my overview.
15. As Andreas, I want the Sessions view to be chat-first: the chat fills the workspace area, the file tree, editor and git pane are hidden behind one toggle (closed by default), shells open only on demand, and the apps dashboard and in-chat diff cards stay, so that the conversation is the focus and nothing is lost.
16. As Andreas, I want VS Code sessions active in the last 30 minutes in my workspaces shown as observed sessions (read-only, marked "in VS Code"), so that I can see all my work while I move over.
17. As Andreas, I want an observed session to show Live or Quiet and render its conversation as it updates, so that I can follow it without switching windows.
18. As Andreas, I want observed sessions that go quiet for over 30 minutes to drop off the live list, so that it stays short.

### Repo icons

18a. As Andreas, I want to give each repo group an icon, either one from the built-in icon set plus an accent colour or my own PNG/SVG, so that I can tell at a glance which session handles which repo.
18b. As Andreas, I want a repo group without a chosen icon to get an automatic first letter on a colour derived from its name, so that every repo is recognisable from day one.
18c. As Andreas, I want the repo icon on sidebar rows, session tabs, the Needs you queue, board cards and feature headers, and in Windows notifications, so that it follows the work everywhere.
18d. As Andreas, I want each worktree to show a short tag next to the shared icon (its folder name minus the repo name, e.g. "shard-2"), so that I can tell worktrees of one repo apart.

### Board

19. As Andreas, I want a single board of the tickets from every workspace, so that I see all flow progress in one place.
20. As Andreas, I want four columns (Backlog, Blocked, In progress, Done), so that a ticket's stage is clear.
21. As Andreas, I want a ticket whose status is needs-triage, needs-info or missing shown in Backlog, so that untriaged work is visible.
22. As Andreas, I want a ticket whose "Blocked by" lists any unresolved ticket shown in Blocked, so that I see what's waiting on what.
23. As Andreas, I want a ticket that is claimed, or has its own progress notes file, shown in In progress, so that active work stands out.
24. As Andreas, I want a resolved or wontfix ticket shown in Done, so that finished work is clear.
25. As Andreas, I want both `Status: x` and `**Status:** x` (and the same for Blocked by) read the same way, so that tickets from older and newer flows all parse.
26. As Andreas, I want each feature to show a progress bar (done out of total) and the last line of its progress notes, so that I can read where a flow stands.
27. As Andreas, I want worktree copies of the same ticket merged into one card that shows the most advanced status and where it was seen, so that shards don't show five duplicates.
28. As Andreas, I want features where every ticket is done folded into a Finished features strip that I can expand, so that 20 old features don't bury current work.
29. As Andreas, I want a feature with a spec but no tickets yet shown as "spec only", so that a flow at stop 2 still appears.
30. As Andreas, I want to filter the board by repo group or workspace, so that I can focus on one project.
31. As Andreas, I want the board to update live when ticket files change on disk, so that it follows the agents as they work.
32. As Andreas, I want each card to show the workspace's session status, so that I can tell whether anyone is working on it right now.
33. As Andreas, I want clicking a card to open a side drawer with the rendered ticket, its progress notes and blockers, so that I can read it without leaving the board.
34. As Andreas, I want an Open session button in the drawer that switches to Sessions on that workspace, so that I go from ticket to chat in one click.
35. As Andreas, I want the board never to write ticket files, so that the agents' files stay the single source of truth.

### Switching

36. As Andreas, I want a Sessions | Board toggle in the title bar and Ctrl+1 / Ctrl+2, so that flipping between views is instant.
37. As Andreas, I want the tray menu to open the window straight into Sessions or Board, so that I land where I meant to.

### Account profiles

38. As Andreas, I want to create a named account profile, so that a workspace can run on a different Claude login.
39. As Andreas, I want my existing login to be the Default profile, so that nothing changes until I add another.
40. As Andreas, I want to log a profile in once through a shell tab the app opens with that profile active, so that signing in uses Claude's own login flow.
41. As Andreas, I want to assign exactly one profile to each workspace and change it later, so that I can move work between accounts.
42. As Andreas, I want every profile to share my global CLAUDE.md, skills, plugins, settings, hooks, agents, commands, and memory plus transcripts with Default, so that each account behaves like me.
43. As Andreas, I want only the login and account file kept separate per profile, so that the accounts' rate limits stay independent.
44. As Andreas, I want the app to check and repair a profile's shared links before starting a session on it, so that a broken link never gives me a session without my setup.
45. As Andreas, I want to see a profile shown as "not logged in" when it has no login yet, so that I don't start sessions that will fail.
46. As Andreas, I want the past-sessions list and observed sessions to read the transcripts of the workspace's profile, so that history works on every account.
47. As Andreas, I want a usage strip with one bar per profile's rate-limit window, the current workspace's profile highlighted, so that I can see which account has room.

### Tray and autostart

48. As Andreas, I want closing the window to hide it to the tray while sessions keep running, so that closing never kills work.
49. As Andreas, I want the tray menu to offer Open, Sessions, Board, Start with Windows (checkbox) and Quit, so that the app's lifecycle is in one place.
50. As Andreas, I want Quit to ask for confirmation when a session is mid-turn, so that I don't kill work by accident.
51. As Andreas, I want a Start with Windows option that launches the app hidden in the tray at login, so that it's always there.
52. As Andreas, I want opening the app again to focus the existing window, so that I never run two copies.
53. As Andreas, I want a per-user Windows installer that needs no admin rights, so that autostart has a stable program to launch.

### Tooling

54. As Andreas, I want the repo on pnpm with the native terminal module's build allowed, so that it follows my tooling rule.

## Implementation Decisions

- **Package manager first.** Move from npm to pnpm. Allow the native terminal module's build script, and keep the existing rebuild-for-Electron step working.
- **The main process owns session status.** Session status is derived in the main process from the Claude event stream plus the permission server's pending requests, not in the renderer. The tray badge and notifications need it while the window is hidden. A pure **session status reducer** takes (previous status, event) to the next status:
  - process spawned → Idle (a fresh or resumed chat with no turn yet is not working and not waiting)
  - user message sent → Running
  - permission request raised for the session → Needs approval
  - permission request resolved, and none left → Running
  - result event (turn finished) → Your turn
  - process exit → Idle
  It records when each status started, so the Needs you queue can sort by how long each session has waited. The main process broadcasts changes to the renderer.
- **Attention module (main).** It subscribes to status changes, keeps the waiting set, updates the tray badge and tooltip, and fires a Windows notification on entry into a waiting status. The renderer reports which session is on screen and whether the window is visible, so notifications for that session are skipped. Clicking a notification focuses the window on that session.
- **Workspace store.** Extends today's project store. Each workspace gains an account profile id (default "default") and a repo group key. The key is derived from git's common directory, so worktrees of one repo share it; a folder outside git is its own group. Existing saved projects migrate with profile "default". UI text says "workspace".
- **Repo identity.** Each repo group has an identity: a display name, plus an icon that is one of a built-in icon name with accent colour, a custom image copied into the app's data folder, or unset. Unset renders the first letter of the name on a colour hashed from the repo group key. Identities are stored by repo group key next to the workspace store, and edited from the repo group's row in the sidebar. A workspace's tag is its folder name with the repo's folder name and leading separators removed, or empty when they're the same. Notifications use the repo icon rendered to an image.
- **Account profile module (main).** A profile store (id, name, config folder; Default = `~/.claude`). Creating a profile makes its folder under the app's data folder and links the shared items from Default: directories as junctions, files as hard links (Windows file symlinks need Developer Mode, which is off). The login and account file are never linked. A `ensureProfileLinks(profile)` check runs before every session start and repairs broken or replaced links. Logged-in is detected by the profile's credentials file existing. Starting `claude` for a workspace sets `CLAUDE_CONFIG_DIR` to its profile folder; Default leaves it unset. The login shell tab is a normal shell with that variable set. See ADR 0001.
- **Transcript location follows the profile.** The past-sessions list and observed sessions read `<profile folder>/projects/<sanitised cwd>/`. Because memory and transcripts are shared, Default and every profile see the same files.
- **Observed sessions module (main).** For each workspace it lists transcripts tagged `entrypoint: claude-vscode` that changed in the last 30 minutes and aren't hosted sessions. It tails the one being viewed and pushes new lines to the renderer through the existing chat item rendering, read-only. An observed session is Live if its transcript changed in the last 2 minutes, otherwise Quiet.
- **Board module (main).** A pure **board reader**: (list of workspaces, file reader) → board model of repo groups, features, tickets, columns and progress. A watcher on each workspace's `.scratch/` triggers a debounced re-read and pushes the new model to the renderer. Rules:
  - A feature is one `.scratch/<name>/` folder. Its tickets are `issues/NN-*.md`. Its notes are `progress.md`. A ticket's own notes are `issues/NN-*.progress.md`. Other files are ignored.
  - Status and Blocked by are read from lines matching `Status:` / `**Status:**` and `Blocked by:` / `**Blocked by:**`, ignoring case and markdown bold. "None…" in Blocked by means no blockers. Ticket numbers are read from the list.
  - Ticket files may carry a letter suffix (`02b-*.md`); the suffix is part of the ticket number (`02b`) and blocker lists may name it.
  - Column: resolved or wontfix → Done. A status starting with "blocked", or any listed blocker not resolved → Blocked. Claimed, or own progress file exists → In progress. Otherwise → Backlog.
  - Worktree merge: tickets with the same repo group, feature name and ticket file name merge into one card (two different files sharing a number stay two cards). The status rank is Backlog < Blocked < In progress < Done, and the card keeps the highest one plus the list of workspaces it was found in.
  - Feature progress is Done tickets out of total, plus the last non-empty line of `progress.md`. All done → finished. A spec but zero tickets → spec only.
  - The status word is the first word after the label; text after it is a note. Canonical lifecycle (see `docs/agents/issue-tracker.md`): needs-triage, needs-info, ready-for-agent, ready-for-human → Backlog; in-progress → In progress; blocked → Blocked; resolved, wontfix → Done. Legacy words: done, complete, completed, closed → Done; claimed, doing, wip → In progress; anything else → Backlog with an unknown-status badge.
  - Discovery: the board scans configurable roots (default `C:\projects`, `C:\darkfall64`) for repos with a `.scratch/` and offers each one not yet added in a "Not added" strip with an Add workspace button. Their tickets show only once added.
  - The board never writes. See ADR 0002.
- **Board layout (replaces the feature-row layout).** GitHub Projects style: four full-height columns side by side, independently scrolling, cards stacked. Feature and repo are labels on cards and filters in a toolbar (repo, feature, search, Group by none/feature/repo; grouping gives collapsible swimlanes with the feature progress bar). The Done column hides finished features' cards behind "+N from M finished features · show". Discovery is one slim line ("N repos with tickets aren't added · Review") opening a dialog of repos only; worktrees appear only with "show worktrees". Clicking a card opens a resizable reading panel about 50% wide with the rendered ticket, notes, status line, blocker links and Open session; Esc closes, up/down step through the column. See ticket 15.
- **Now building.** A compact strip above the board lists active features, newest activity first, with a progress bar, the in-progress ticket, the most urgent session status, the last progress note and the time since last activity. Active = a ticket in progress, or any feature file changed in the last 24 hours, or a Running hosted session in its workspace (that workspace's most recently active feature only). Clicking a row filters the board to that feature. See ticket 16.
- **Renderer.** A top-level view switch (Sessions | Board) in the title bar, with Ctrl+1 / Ctrl+2. Chat tab switching moves from Ctrl+1..9 to Alt+1..9 to free them. The Sessions sidebar is grouped by repo group. A Needs you queue panel has a "next waiting" shortcut. The Board view is laid out as in "Board layout" above (toolbar filters, Group by, Finished features toggle, wide reading panel). A usage strip has one bar per profile.
- **Tray and lifecycle (main).** Single-instance lock: a second launch focuses the first. Closing the window hides it. The tray menu has Open, Sessions, Board, Start with Windows ✓ and Quit, and Quit confirms when any session is Running. Start with Windows uses Electron's login-item setting with a "hidden" argument, so the app starts in the tray. The checkbox reflects the real login-item state.
- **Packaging.** electron-builder, NSIS, per-user install, no admin. The tray icon and app icon live in the build resources. Autostart is only offered in the installed build; in dev the checkbox is disabled and says why.
- **Chat-first layout.** The workspace area shows the chat full width. A single toggle (button + shortcut) slides in the IDE panels (file tree, editor, git pane) as they are today; it is closed by default and remembered per workspace. The bottom shell strip is gone; a shell opens as a tab or drawer on request, and the account login (ticket 08) opens one the same way. The apps dashboard and in-chat diff cards are unchanged. Nothing is deleted.
- **Docs.** `docs/BACKLOG.md` is marked as replaced by this revamp. The README describes the two views, profiles and tray.

## Testing Decisions

- A good test drives a module only through its public function, with real-shaped inputs (fixture folder trees, recorded event sequences), and asserts on the output model. It never checks internals.
- The repo has no tests today. Add Vitest as the runner, plus a `test` script and a quick-tier script that runs typecheck + tests.
- **Seam 1 — board reader.** Fixture `.scratch` trees in a temp folder cover: both Status styles; missing status; Blocked by "None" vs a list with one unresolved blocker; claimed and progress-file In progress; worktree copies with different statuses merging to the highest; a finished feature; a spec-only feature; and junk files ignored. Real-world prior art to copy shapes from: the Agon-survivors `progression-flow` folder (bold Status, `progress.md`) and FantasySurvival (`Status: needs-triage`).
- **Seam 2 — session status reducer.** Recorded sequences of stream-json events and permission raise/resolve events produce the expected status sequence and status-start times, including two overlapping permission requests and an exit during Needs approval.
- **Seam 3 — profile linker.** `ensureProfileLinks` against a temp Default folder and a temp profile folder: shared directories become junctions, shared files become hard links, the credentials and account files are never created or linked, and a replaced or deleted link is repaired on the next run.
- Lane 2 (Andreas, in the running app): tray, badge, notifications and clicking them, autostart after a Windows login, the installer, the look of the board and drawer, observed sessions following a live VS Code chat, and logging in a second profile.

## Out of Scope

- Writing ticket files from the board (dragging cards, editing status).
- Typing into or approving VS Code (observed) sessions.
- Linking a card to the exact session working on it; links are per workspace only.
- Scanning folders that aren't added workspaces.
- Code signing, auto-update, Mac/Linux.
- Showing claude-desktop sessions as observed.

## Further Notes

- The ticket format this board reads is the one in `docs/agents/issue-tracker.md`, so this repo's own `.scratch/workspace-hub/` tickets are the first test of the board.
- Sharing transcripts across profiles means a workspace moved to another account keeps its history and memory, but two profiles running in the same workspace write to the same transcript folder (separate files per session, so no clash).
