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

**Session status**:
What a hosted session is doing: Running, Needs approval, Your turn, or Idle. An observed session is only ever Live or Quiet.
_Avoid_: State, activity

**Waiting session**:
A hosted session in Needs approval or Your turn. The tray badge counts these.
_Avoid_: Pending, blocked session

**Repo group**:
The worktrees of one git repository, shown together under the repo's name.
_Avoid_: Shard set, worktree family

## Board

**Board**:
The single kanban view of the tickets from all workspaces.
_Avoid_: Kanban, dashboard

**Feature**:
One `.scratch/<feature>` folder: a spec plus its tickets and progress notes.
_Avoid_: Epic, flow

**Ticket**:
One file under a feature's `issues/` folder. On the board it is shown as a card.
_Avoid_: Issue (in UI text), task

**Column**:
One of the board's four stages: Backlog, Blocked, In progress, Done. The stage comes from the ticket's status and blockers.
_Avoid_: Lane, state
