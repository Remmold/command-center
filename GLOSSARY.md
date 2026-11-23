# Command Center

One desktop window for watching and driving Claude Code work across every workspace, and for tracking the tickets that work produces.

## Workspaces and sessions

**Workspace**:
A project folder added to the command center. It is the unit that sessions run in and tickets belong to.
_Avoid_: Project (in new UI text), folder, repo

**Account profile**:
A named Claude login that a workspace uses. Every workspace uses exactly one. The default profile is the login Andreas already has; it is shown as "Personal" until renamed.
_Avoid_: Licence, account, user

**Account**:
How an account profile is shown: its name and plan, e.g. "Work · Team". Each profile has an editable short name; the email appears only in tooltips and Settings. Projects and their sessions are grouped by account in Work, the Dashboard, the Board and Settings.
_Avoid_: Subscription, licence

**Adopted folder**:
An existing Claude config folder (such as one a VS Code profile uses) that an account profile runs on instead of a folder the app made. The app only reads it: no shared-item links, no writes, and removing the profile never deletes it.
_Avoid_: Imported profile

**Hosted session**:
A Claude Code session started and controlled from the command center.
_Avoid_: Chat, pane

**Remote Control**:
A hosted session's link to claude.ai/code, so it can be followed and steered from the web or the phone. Turned on per session with `/remote-control`, or at start when the CLI says so; a new process starts with it off.
_Avoid_: Bridge, remote session

**Observed session**:
A Claude Code session running somewhere else (the VS Code extension). The command center follows it read-only.
_Avoid_: External session, VS Code chat

**Take over**:
Moving an observed session into the command center: it is resumed as a hosted session, once VS Code's agent has finished its turn (at once when it waits on the user). The observed session then leaves the Work list's VS Code rows.
_Avoid_: Handover, import

**Session title**:
The name a session goes by in lists and headers. It is "New session" before any prompt, then the first prompt, shortened, until Claude names the session (as in the extension). A rename beats both for good, and reaches the CLI, so VS Code's history shows it too.
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
The picture that marks one repo group everywhere in the app: a picked icon (built-in with an accent colour, an image, a found icon or the letter on purpose), else the automatic icon.
_Avoid_: Logo, avatar

**Found icon**:
An image the app found in the repo itself (a named app icon file, the Unity or Godot project icon, or an executable's own icon), copied into the app's data. The best one is the **automatic icon**, shown while the user picked none; with none found, the letter shows.
_Avoid_: Detected logo, auto avatar

**Worktree tag**:
The short label that tells worktrees of one repo group apart, e.g. "shard-2".
_Avoid_: Suffix, shard name
