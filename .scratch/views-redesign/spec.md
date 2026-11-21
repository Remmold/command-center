# Views redesign: Dashboard, Work and Board in a VS Code look

Status: ready-for-agent

## Problem Statement

The command center does everything Andreas asked for, but it is hard to read. Reaching a chat means three levels of navigation: workspace tabs across the top, a sidebar tree (repo → workspace → VS Code sessions, with the Needs you queue inside it), then chat tabs per workspace. The things he most wants to see (who needs him, what is being built, which sessions are live, how much of each account is left) are spread over the sidebar, the board's strip and the header. The styling is a custom zinc look, not the VS Code look he works in all day.

## Solution

Three top-level views, switched in the title bar and with Ctrl+1 / Ctrl+2 / Ctrl+3:

- **Dashboard** (default on launch): **Needs you**, **Now building**, **Live sessions** and **Usage per account**, all on one screen. Every item is one click from where it leads.
- **Work**: one flat list of every session across all workspaces, grouped by state, beside the open chat. There are no workspace tabs and no chat tabs. A second chat can be split in beside the first.
- **Board**: today's GitHub-style kanban, without the Now building strip (it moves to the Dashboard).

The whole app takes VS Code's standard **Dark Modern** look, and the chats copy the Claude Code extension's message styling. Workspace management, accounts, apps, scan roots and Start with Windows move to one **Settings** page.

## User Stories

### Navigation

1. As Andreas, I want three views (Dashboard, Work, Board) in the title bar and on Ctrl+1 / Ctrl+2 / Ctrl+3, so that everything is one keystroke away.
2. As Andreas, I want the app to open on the Dashboard, so that the first thing I see is what matters.
3. As Andreas, I want the tray menu to open Dashboard, Work or Board directly, so that I land where I meant to.
4. As Andreas, I want a gear in the title bar and Ctrl+, to open Settings, so that setup is out of my way until I need it.

### Dashboard

5. As Andreas, I want **Needs you** at the top of the Dashboard, showing every waiting session oldest first with repo icon, worktree tag, title, status (Needs approval / Your turn) and wait time, so that I see first what blocks on me.
6. As Andreas, I want clicking a Needs you item to open that session in Work with its input or approval prompt focused, so that I can act in one click.
7. As Andreas, I want **Now building** on the Dashboard with today's rules (active features, progress bar, ticket in progress, session status, last note, time ago, 6 rows + more), so that I can see what is moving.
8. As Andreas, I want clicking a Now building row to open the Board filtered to that feature, so that I can drill into its tickets.
9. As Andreas, I want **Live sessions** as a grid of cards, one per session that is Running, Needs approval or Your turn, plus observed VS Code sessions that are Live. Each card shows repo icon, worktree tag, title, status, the last assistant message snippet (2 lines) and time since the last event. That way I can see what every session is doing.
10. As Andreas, I want clicking a Live session card to open it in Work, so that I can jump in.
11. As Andreas, I want **Usage per account** on the Dashboard: one row per profile with how full its rate-limit window is, when it resets, and today's tokens, so that I can pick an account with room.
12. As Andreas, I want empty Dashboard sections to say so in one muted line ("Nobody is waiting on you"), so that empty doesn't look broken.

### Work

13. As Andreas, I want a single left list of every session across all workspaces, grouped as **Needs you**, **Running**, **Idle**, **In VS Code**, so that I find any session without opening workspaces.
14. As Andreas, I want each row to show repo icon, worktree tag, title and status dot, so that I can tell which repo and which session it is.
15. As Andreas, I want a session's title taken from its first prompt (shortened), and double-click to rename it, so that sessions name themselves the way they do in VS Code.
16. As Andreas, I want the list ordered within each group by most recent activity, so that live work is on top.
17. As Andreas, I want a search box above the list that filters by title, repo or workspace, so that I can find a session fast.
18. As Andreas, I want **+ New session** to ask which workspace (a searchable picker, with "Add workspace…" at the bottom) and then open the new chat, so that starting work is two clicks.
19. As Andreas, I want clicking a row to open that chat on the right, so that the list is the only navigation.
20. As Andreas, I want Ctrl+click on a row, or a split button in the chat header, to open a second chat beside the first, with never more than two, so that I can watch two sessions at once.
21. As Andreas, I want Ctrl+J to keep jumping to the next waiting session, so that clearing the queue stays fast.
22. As Andreas, I want the chat header to show repo icon, worktree tag, title, account profile and status, so that I always know where I am typing.
23. As Andreas, I want Ctrl+B (IDE panels) and Ctrl+\` (shell) to act on the open session's workspace, hidden by default, so that the IDE bits are there when I need them.
24. As Andreas, I want observed VS Code sessions to open read-only in the same chat area, marked "in VS Code", so that watching them feels the same.
25. As Andreas, I want closing a session (row menu → Close) to stop its process and move it to the past-sessions list, so that the list doesn't fill up forever.
26. As Andreas, I want past sessions reachable from the list's menu ("Past sessions…", per workspace), so that resume still works.

### Board

27. As Andreas, I want the Board to stay as it is minus the Now building strip, so that the deep view is unchanged.

### Settings

28. As Andreas, I want a Settings page with sections Workspaces, Accounts, Apps, Board and General, so that every setup task is in one place.
29. As Andreas, I want Workspaces to list every workspace grouped by repo, with its account profile picker, the repo icon editor, and Remove, plus "Add workspace", so that today's sidebar tools still exist.
30. As Andreas, I want Accounts to create and rename profiles and log them in, so that account setup is in one place.
31. As Andreas, I want Apps to hold today's apps dashboard (start/stop my local apps), so that nothing is lost.
32. As Andreas, I want Board to hold the scan roots and the not-added repos with their Add buttons, so that discovery is set up in one place.
33. As Andreas, I want General to hold Start with Windows, so that the tray isn't the only place to find it.

### Look

34. As Andreas, I want the whole app in VS Code's Dark Modern colours and fonts (Segoe UI for text, Cascadia Code / Consolas for code), so that it feels like the editor I use.
35. As Andreas, I want chat messages styled like the Claude Code extension's, so that the conversation reads the way I am used to. That means user prompts in a subtle bordered box, assistant text unboxed, tool calls as compact collapsible rows, and diffs in VS Code's diff colours.
36. As Andreas, I want status colours to stay distinct in the new theme (Needs approval and Your turn stand out from Running and Idle), so that attention cues survive the restyle.

## Implementation Decisions

- **View store.** `view` becomes `'dashboard' | 'work' | 'board'`, defaulting to `'dashboard'`. Ctrl+1/2/3 select them, and the tray menu items and notification clicks use it (a notification click opens Work on that session). Settings is a separate overlay page, not a view.
- **Session list model (new, pure).** It takes hosted sessions (from the existing per-workspace session state), their statuses (ticket 05 of workspace-hub), observed sessions (ticket 10), workspaces and repo identities. It returns grouped, ordered rows: groups Needs you → Running → Idle → In VS Code, most recent activity first within each group, filtered by search over title, repo name and worktree tag. Waiting rows inside Needs you keep the queue order (longest wait first).
- **Session titles.** Each hosted session stores a `title`. It is set from its first user prompt (first line, whitespace collapsed, cut to 60 characters with "…"), unless renamed, and a rename is kept. Before any prompt the title is "New session". Persisted with the session.
- **Work layout.** A left list (resizable, default 300 px) and a chat area holding one chat, or two side by side when split. The split pair is remembered. Workspace tabs (ProjectTabs), the sidebar tree and per-workspace chat tabs (CenterTabs) are removed from the UI. The per-workspace session data they read stays and feeds the list model. The IDE panels and shell attach to the open session's workspace.
- **Dashboard model (new, pure).** It takes the same inputs plus the board model and usage. It returns Needs you items, Now building rows (reusing the ticket 16 rules unchanged), Live session cards (hosted Running / Needs approval / Your turn, plus observed Live), and usage rows per profile. The last assistant snippet comes from the session's chat items; for observed sessions it comes from their tail.
- **Settings page.** It reuses today's components (ProfilePicker, RepoIdentityEditor, AppsDashboard, scan-roots popover content, not-added list, Start with Windows) in sections. The Board's slim "N repos aren't added · Review" line stays and links to Settings → Board.
- **Theme.** CSS variables for the VS Code Dark Modern palette live in one theme file (editor background #1f1f1f, side bar #181818, title bar #181818, borders #2b2b2b, foreground #cccccc, muted #9d9d9d, accent #0078d4, focus border #0078d4, list hover #2a2d2e, list selection #37373d, input background #313131, plus diff inserted/removed backgrounds). Tailwind's config maps semantic names onto these variables, and components use the semantic names instead of literal zinc colours. Fonts: "Segoe UI", system-ui at 13 px for text; "Cascadia Code", Consolas, monospace for code. Status colours are a separate semantic set chosen to stay distinct on that background.
- **Glossary.** Add Dashboard, Work view and Session title. The "Sessions view" term is retired.

## Testing Decisions

- A good test drives a pure model through its public function with real-shaped inputs and asserts on the rows it returns.
- **Seam 1: session list model.** Grouping and group order; ordering within groups; Needs you keeping queue order; search over title, repo and worktree tag; observed sessions only in In VS Code; closed sessions absent; title rules (first line, 60-character cut, "New session" before any prompt, rename kept).
- **Seam 2: dashboard model.** Needs you order; Live cards include exactly Running / Needs approval / Your turn plus observed Live; snippet taken from the last assistant message; usage rows per profile; empty sections.
- Prior art: `src/shared/needsYou.ts` tests, `src/renderer/state/nowBuilding.test.ts`, `src/renderer/state/usageModel.test.ts`.
- Lane 2 (Andreas): the look against VS Code side by side, the Dashboard's usefulness, the flat list and split chat in daily use, and Settings.

## Out of Scope

- A light theme or a theme picker.
- More than two chats on screen.
- Changes to the board's rules or the kanban layout beyond moving Now building.
- Changes to how sessions run, accounts, notifications or the tray beyond the view names.

## Further Notes

- The workspace-hub spec stays as history; this spec supersedes its Sessions-view and Renderer layout parts.
