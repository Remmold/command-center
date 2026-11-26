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
How an account profile is shown: its name and plan, e.g. "Work · Team". The plan is the Claude subscription the login has. Each profile has an editable short name; the email appears only in tooltips and Settings. Projects and their sessions are grouped by account in Work, the Dashboard, the Board and Settings.
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

**Approval inbox**:
The overlay (Ctrl+Shift+A) that lists every tool approval, question and plan the hosted sessions wait on, oldest first, and answers each one with the chat's own prompt.
_Avoid_: Approval queue, approvals view

**Live sessions**:
The Dashboard panel of sessions in motion: hosted sessions that are Running, Needs approval or Your turn, plus observed sessions that are Live. Broader than the observed status Live.
_Avoid_: Active sessions, running sessions

**Subagent**:
An agent Claude starts with the Agent tool inside a session, in the foreground or the background. Its messages live in its own file beside the session's transcript.
_Avoid_: Child agent, task (the CLI's word for it in its events)

**Test flow**:
A document of manual test steps Claude writes for Andreas, kept in the test-flows folder as a markdown file with a rendered HTML twin he tests from. A session's test flow is the one it last wrote there that exists (standing command lists excepted), else the one named after its repo.
_Avoid_: Test plan, test doc, checklist

**Test tab**:
The tab beside Chat, Agents and Media that shows the session's test flow as its HTML twin, reloading when the file changes. It can pop out into its own window, which follows whichever session is focused in Work.
_Avoid_: Test pane, test viewer

**Agents tab**:
The tab beside Chat and Media that lists a session's subagents grouped by the turn that started them, newest turn first (older turns fold), working ones first within a turn, and opens one in its live agent view: its transcript, read-only, following as it grows.
_Avoid_: Agent panel, transcript dialog

**Background process**:
A command an agent left running in the background of a hosted session: started there, or moved there mid-run. It is usually a dev server, a watcher or a long build. It is Running until it finishes, fails or is stopped, and it is listed until its session closes. Closing the session ends it.
_Avoid_: Background shell, task (the CLI's word), server (not all of them are servers)

**Processes tab**:
The tab beside Chat, Agents and Media that lists a session's background processes, running ones first. Each one shows its status, command, its output in the terminal look and any local port it serves, with a Stop button.
_Avoid_: Shells tab (the Shell drawer is your own terminal)

**Terminal**:
A shell, or one command, that the app runs for Andreas in a workspace's folder and that he can type into. It is Running until it exits, then Exited with its code (or Stopped, when he stops it), and it stays listed until he closes it. The Shell drawer and the Processes view show the same terminals.
_Avoid_: Shell (only the drawer's name), console, tab

**Processes view**:
The view (Ctrl+5) that shows every background process and every terminal across all workspaces, grouped by workspace with running ones first, beside the selected one's output in a terminal.
_Avoid_: Process manager, task manager, servers view

**Run it myself**:
Stopping one of Claude's background processes and starting the same command, in the same workspace folder, as Andreas's own terminal. Claude no longer sees its output afterwards.
_Avoid_: Take over (that moves a VS Code session), adopt, detach

**Ended (no final report)**:
A subagent no live process reports any more (a resumed, old or VS Code chat) that stopped writing for 10 minutes, with nothing of its own still writing, without handing back a report or being interrupted. It never counts as working. An agent the chat's live process still reports stays working however quiet, as a long build writes nothing until it returns.

**Repo group**:
The worktrees of one git repository, shown together under the repo's name.
_Avoid_: Shard set, worktree family

**Own group**:
A named group of sessions in the Work list that the user makes, names and orders by dragging, kept under one account. It may hold sessions of other accounts too: where a session sits never changes the account it runs on, which comes from its workspace. Sessions in no own group sit in Ungrouped, which is last in the account until dragged elsewhere. The first own groups were seeded from the repo groups.
_Avoid_: Folder, category, channel

**Guest session**:
A session placed in an own group or Ungrouped under an account other than its own. Its row carries a tag naming the account it runs on.
_Avoid_: Moved session, foreign session

**Last prompt strip**:
The one-line strip at the top of a chat showing the last prompt Andreas sent there, shown while that prompt is scrolled out of view. Clicking it scrolls the chat back to the prompt.
_Avoid_: Pinned message, sticky prompt

## Views

**Dashboard**:
The view the app opens on: Needs you, Now building, Usage per account and Live sessions on one screen.
_Avoid_: Home, overview, start page

**Chat drawer**:
The panel docked on the Dashboard's right that shows one hosted session's chat, so it can be answered without leaving the Dashboard. It is the same chat Work shows, not a copy: same process, draft and scroll. Opening one there leaves Work's open chats as they were.
_Avoid_: Peek, side panel, quick reply

**Work view**:
The view with one list of every session across all workspaces beside the open session, or two sessions side by side.
_Avoid_: Sessions view, chat view, workspace view

**Shell drawer**:
The panel at the bottom of Work (Ctrl+`) that shows terminals as tabs. Opening a tab there and in the Processes view shows the same terminal.
_Avoid_: Terminal panel, console

**Context view**:
The view that shows, per workspace, everything Claude is configured to use there (CLAUDE.md files, memory, skills, agents, commands, MCP servers, plugins, settings and hooks) as context layers, with an editor beside them. It reads files; it does not ask Claude.
_Avoid_: Config view, setup, Claude view

**Context layer**:
One level of where Claude context comes from, in the order it applies: the account, then the repo, then local (CLAUDE.local.md, local settings, and the MCP servers the account's entry for this workspace adds). An item in a layer shared with Personal is one file for both accounts.
_Avoid_: Scope, level, tier

**Kind group**:
The items of one kind within a context layer, shown together under one heading with their count and tokens: CLAUDE.md, Memory, Skills, Agents, Commands, MCP servers, Plugins, Settings & hooks, always in that order.
_Avoid_: Category, section

**Context map**:
The Context view's picture of one workspace's context: the context layers as lanes, split into what loads at every start and what loads on demand, with each item sized by its tokens and lines for imports and for MEMORY.md's links to memory files. Findings show on the items they concern.
_Avoid_: Graph, diagram, tree

**Guided tour**:
The numbered steps beside the context map that walk through it in plain words with the workspace's real numbers: what every chat starts with, memory, skills, agents and commands, settings, hooks and MCP, then the health check and the drift check.
_Avoid_: Wizard, tutorial, walkthrough

**Health check**:
The checks the app runs on context files itself, at no token cost: MEMORY.md longer than Claude loads, memory files MEMORY.md never links, index lines to missing files, and CLAUDE.md files past Claude Code's size warning. `[[links]]` that match no memory file are listed as notes, never as problems.
_Avoid_: Lint, audit, validation

**Drift check**:
A hosted session, started from the Context view, in which subagents check context files against the current code and record what has drifted as findings; Andreas ticks which fixes it applies. It comes in three kinds: **project** (one workspace's memory and repo files), **account** (the account's own files) and **cross-project** (chosen workspaces of one account plus that account's files). A run not done is **running** while its chat is in Work, and **stopped** once that chat is gone; a stopped run's findings can still be applied.
_Avoid_: Context cleanup (its old name), memory audit (that is the interactive skill), context refresh

**Finding**:
One thing a health check or drift check reports about one context file: what is wrong, the evidence, and the proposed fix. Andreas ticks the findings he wants fixed; nothing is changed before he does.
_Avoid_: Issue (that is a ticket), problem, warning

**Start total**:
The estimated tokens every new chat in a workspace starts with from its context: CLAUDE.md files and their imports, MEMORY.md, and the names and descriptions of skills and agents. Subfolder CLAUDE.md files, skills offered only as slash commands, and MCP tools are not in it.
_Avoid_: Context size, context usage (that is a live chat's, from /context)

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

**Copy**:
One checkout's version of a feature or ticket. The board reads a copy from every workspace of a repo group and from every other git worktree of that repo that has a `.scratch`, added or not. A card shows the most advanced copy's status (resolved, in progress, blocked, ready, needs-*), tagged with that copy's worktree tag when it isn't the main checkout.
_Avoid_: Sighting (the code's word), mirror

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
