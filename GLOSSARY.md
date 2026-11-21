# Command Center

One desktop window for watching and driving Claude Code work across every workspace, and for tracking the tickets that work produces.

## Workspaces and sessions

**Workspace**:
A project folder added to the command center. It is the unit that sessions run in and tickets belong to.
_Avoid_: Project (in new UI text), folder, repo

**Account profile**:
A named Claude login that a workspace uses. Every workspace uses exactly one. "Default" is the login Andreas already has.
_Avoid_: Licence, account, user

**Hosted session**:
A Claude Code session started and controlled from the command center.
_Avoid_: Chat, pane

**Observed session**:
A Claude Code session running somewhere else (the VS Code extension). The command center follows it read-only.
_Avoid_: External session, VS Code chat

**Session title**:
The name a session goes by in lists and headers. It comes from the session's first prompt, shortened, and is "New session" before any prompt. A rename replaces it for good.
_Avoid_: Chat name, label, tab name

**Session status**:
What a hosted session is doing: Running, Needs approval, Your turn, or Idle (no process, or a process that has not had a turn yet). An observed session is only ever Live or Quiet.
_Avoid_: State, activity

**Waiting session**:
A hosted session in Needs approval or Your turn. The tray badge counts these.
_Avoid_: Pending, blocked session

**Live sessions**:
The Dashboard panel of sessions in motion: hosted sessions that are Running, Needs approval or Your turn, plus observed sessions that are Live. Broader than the observed status Live.
_Avoid_: Active sessions, running sessions

**Repo group**:
The worktrees of one git repository, shown together under the repo's name.
_Avoid_: Shard set, worktree family

## Views

**Dashboard**:
The view the app opens on: Needs you, Now building, Usage per account and Live sessions on one screen.
_Avoid_: Home, overview, start page

**Work view**:
The view with one list of every session across all workspaces beside the open session, or two sessions side by side.
_Avoid_: Sessions view, chat view, workspace view

**Settings**:
The full-window page for setup: Workspaces, Accounts, Apps, Board and General. It is not a view.
_Avoid_: Preferences, options

## Board

**Board**:
The single kanban view of the tickets from all workspaces.
_Avoid_: Kanban, ticket dashboard

**Feature**:
One `.scratch/<feature>` folder: a spec plus its tickets and progress notes.
_Avoid_: Epic, flow

**Ticket**:
One file under a feature's `issues/` folder. On the board it is shown as a card.
_Avoid_: Issue (in UI text), task

**Column**:
One of the board's four stages: Backlog, Blocked, In progress, Done. The stage comes from the ticket's status and blockers.
_Avoid_: Lane, state

**Scan root**:
A folder the board searches for repos that have tickets but are not added as workspaces yet.
_Avoid_: Search path, watch folder

**Not added**:
A repo or worktree found under a scan root that has tickets but is not a workspace yet. The board lists these so one click adds them.
_Avoid_: Discovered repo, unknown repo, missing workspace

## Identity

**Repo identity**:
How one repo group is shown everywhere in the app: its display name and its repo icon.
_Avoid_: Branding, repo profile

**Repo icon**:
The picture that marks one repo group everywhere in the app: a chosen icon with an accent colour, an image, or a letter by default.
_Avoid_: Logo, avatar

**Worktree tag**:
The short label that tells worktrees of one repo group apart, e.g. "shard-2".
_Avoid_: Suffix, shard name
