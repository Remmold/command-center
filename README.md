# command-center

One desktop window for every Claude Code workspace on this machine: run sessions side by side, see at a glance which ones need you, and follow the tickets they work on.

Sessions are the real `claude` CLI, driven from the app, not a reimplementation. Windows only for now.

## Two views

Switch with the title bar or **Ctrl+1** / **Ctrl+2**.

- **Sessions**: a sidebar of every workspace, grouped by repo, with each session's status and account profile. The chat fills the workspace area. **Ctrl+B** slides in the IDE panels (file tree, editor, git), remembered per workspace. **Ctrl+`** opens a shell on demand.
- **Board**: one kanban of the tickets from all workspaces, in four side-by-side columns: Backlog, Blocked, In progress, Done. Filter by repo and feature, search, and group into swimlanes by feature or repo (each with its progress bar). Done hides the cards of finished features until you show them. Click a card to read the ticket in a resizable side panel (Esc closes, up/down step through the column) and jump from it to its session. Filters, grouping and the finished toggle are remembered.

## Needs you

The **Needs you** queue lists every session waiting on you across all workspaces, longest wait first. Click one to open it, or press **Ctrl+J** to jump to the next.

Session statuses:

| Status | Meaning |
| --- | --- |
| Running | Claude is working |
| Needs approval | Claude is waiting for you to allow a tool |
| Your turn | Claude finished and waits for your message |
| Idle | No process, or a process that has not had a turn yet |

Needs approval and Your turn count as waiting.

## Tray and notifications

Closing the window hides it to the tray; the app keeps running. Quit from the tray menu. The tray icon and the taskbar button show a badge with the number of waiting sessions (1 to 9, then 9+).

A session that starts waiting raises a Windows notification, unless you are already looking at it. Clicking the notification opens that session.

The tray menu has **Start with Windows**. It only works in the installed app; in dev it is greyed out ("installed app only"). When on, the app starts hidden in the tray at login.

## Account profiles

Every workspace uses one account profile, a named Claude login. **Default** is your normal `~/.claude` login. Pick or create a profile from the workspace row in the sidebar; a change applies to the next session started there.

A new profile shares your setup with Default: `CLAUDE.md`, `settings.json`, skills, plugins, hooks, agents, commands and session history (`projects`), plus files that `settings.json` points to (such as a status line script). Only the login itself is separate.

To log a profile in: open the profile picker, click **Log in** (it opens a shell as that profile), run `claude`, then `/login`.

The header shows usage per profile.

## Repo icons

Each repo group has a repo icon and a display name, shown on sidebar rows, session tabs, the Needs you queue, board cards, feature headers and notifications. Click the pencil on a repo row in the sidebar to pick a built-in icon and accent colour, use an image, or go back to the letter. Worktrees of one repo share the icon and are told apart by a short worktree tag (for example `shard-2`).

## Observed sessions

Claude Code chats running in the VS Code extension in an added workspace show up in the sidebar as observed sessions. They are read-only: you can watch the transcript but not type into it. They are listed for 30 minutes after their last activity and show **Live** while active in the last 2 minutes, **Quiet** otherwise.

## Board discovery and ticket lifecycle

The board reads ticket files from each workspace's `.scratch/<feature>/` folders. It also scans a few folders (scan roots, default `C:\projects` and `C:\darkfall64`) for repos that have tickets but are not added yet, and shows one line, "N repos with tickets aren't added · Review". **Review** lists those repos with **Add workspace**; tick "show worktrees" to list worktrees too. Edit the scan roots from the board settings button; the scan reruns on opening the board and every 5 minutes.

A ticket's column comes from its `**Status:**` word (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `in-progress`, `blocked`, `resolved`, `wontfix`) and its `**Blocked by:**` line. The full rules, and who sets which word, are in [docs/agents/issue-tracker.md](docs/agents/issue-tracker.md#ticket-lifecycle).

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| Ctrl+1 / Ctrl+2 | Sessions / Board |
| Ctrl+J | Jump to the next waiting session |
| Ctrl+B | Show or hide the IDE panels |
| Ctrl+` | Open, show or hide shells (the key left of 1, on any layout) |
| Ctrl+T | New chat in the current workspace |
| Ctrl+W | Close the current chat |
| Ctrl+K | Focus the chat input |
| Alt+1 … Alt+9 | Switch to chat tab 1 … 9 |
| Ctrl+S | Save the file in the editor |
| Enter / Shift+Enter | Send / new line in the chat input |

## Prerequisites

- **Node.js 20+** and **pnpm 10**
- **Claude Code CLI** on PATH (`claude` or `claude.cmd`). See https://docs.claude.com/en/docs/claude-code.
- **Windows:** nothing extra. `node-pty` ships prebuilt binaries that load in Electron as-is; Visual Studio Build Tools are only needed to build it from source.

## Commands

```sh
pnpm install
```

| Command | What it does |
| --- | --- |
| `pnpm dev` | Run the app with hot reload |
| `pnpm build` | Build into `out/` |
| `pnpm start` | Run the built app |
| `pnpm test` | Run the test suite (Vitest) |
| `pnpm quick` | Typecheck plus tests: the check to run before committing |
| `pnpm dist` | Build the Windows installer into `release/` (unsigned, per-user, one click) |

## Where your data lives

Everything the app saves is in `%APPDATA%\command-center\`, never in the repo:

| File | Holds |
| --- | --- |
| `projects.json` | The added workspaces |
| `profiles.json` | Account profiles (the profiles' own login folders sit under `profiles\`) |
| `repo-identities.json` | Repo display names and icon choices |
| `repo-icons\` | Images picked as repo icons |
| `board-settings.json` | Board scan roots |
| `permission-hook.cjs` | The hook that routes tool approvals to the app |

## Layout

```
src/
  main/        Electron main process: sessions, board, profiles, tray, notifications
  preload/     contextBridge surface exposed to the renderer
  renderer/    React + Tailwind UI
  shared/      types and logic shared between main and renderer
```

Terms used in the app are defined in [GLOSSARY.md](GLOSSARY.md); design decisions are in [docs/adr/](docs/adr/).

## License

Personal project, public for transparency. No license attached yet.
