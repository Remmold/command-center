# Context view

Status: ready-for-agent

## Problem Statement

Claude's context for a workspace comes from many places: the account's CLAUDE.md, the repo's CLAUDE.md and its imports, CLAUDE.local.md, the auto-memory folder, skills, agents and commands from the account, plugins and the repo, MCP servers configured in several files, and three layers of settings and hooks. Andreas works in many workspaces on two accounts. He can't easily see what Claude uses in a given project, how much of every new chat that costs, or open the right file to fix it. Today that means hunting through `~/.claude`, `~/.claude-work` and each repo's `.claude` folder by hand.

## Solution

A fourth view, **Context** (Ctrl+4), beside Dashboard, Work and Board. On the left is the workspace list, grouped by account like Work's, with each workspace's start total (for example "command-center · ~4.2k"). It starts on the workspace last open in Work. The middle pane shows the selected workspace's context layers in the order they apply (account → repo → local), each listing its CLAUDE.md files, memory, skills, agents, commands, MCP servers, plugins, settings and hooks, with an estimated token cost for what loads at every start. The right pane is the app's own editor: clicking an item opens it, and Ctrl+S saves it. Everything is read from files on disk, never by asking Claude, so it costs no tokens and is labelled "as configured".

## User Stories

1. As Andreas, I want a Context view in the sidebar after Board, so that Claude's setup has one home.
2. As Andreas, I want Ctrl+4 to open Context, so that it matches Ctrl+1/2/3 for the other views.
3. As Andreas, I want a workspace list grouped by account, as in Work, so that I find a project the way I already do.
4. As Andreas, I want each workspace row to show its start total, so that I can compare projects at a glance and spot a bloated one.
5. As Andreas, I want Context to start on the workspace I last had open in Work, so that the project I'm in is one click away.
6. As Andreas, I want the selected workspace's context shown as layers in the order they apply (account, then repo, then local), so that I understand what overrides what.
7. As Andreas, I want the account layer to follow the workspace's account profile, so that a Work workspace shows `.claude-work`'s setup, not Personal's.
8. As Andreas, I want every CLAUDE.md that loads at start listed with its estimated tokens: the account's, the repo's (and any in parent folders up to the drive root), and CLAUDE.local.md, so that I see what every chat starts with.
9. As Andreas, I want files a CLAUDE.md @-imports listed under it and counted in the start total (following imports up to 5 steps deep), so that hidden context is visible.
10. As Andreas, I want CLAUDE.md files in subfolders listed under "loads when Claude works there" and kept out of the start total, so that the total stays honest.
11. As Andreas, I want the workspace's memory folder shown with MEMORY.md counted and its other files listed, so that I can review what Claude remembers.
12. As Andreas, I want skills, agents and commands from the account, from enabled plugins and from the repo listed with where each comes from, so that I know why a skill is available.
13. As Andreas, I want skills and agents to add only their name and description to the start total, so that the estimate matches how Claude loads them.
14. As Andreas, I want MCP servers listed with where each is configured (account, the account's project entry, the repo's .mcp.json), marked "tools not counted", so that I know what's connected without the app starting servers.
15. As Andreas, I want enabled plugins listed per layer, so that I see what each brings.
16. As Andreas, I want the settings.json layers (account, repo, local) listed with their hooks and permission allow rules summarised, so that I see what runs and what is pre-approved.
17. As Andreas, I want a start total at the top of the workspace's layers, so that I know the whole cost in one number.
18. As Andreas, I want clicking an item to open it in an editor inside Context, so that I can fix it without leaving the view.
19. As Andreas, I want Ctrl+S to save the open file, so that editing feels like the editor in Work.
20. As Andreas, I want a JSON file (settings.json, .mcp.json) refused on save when it doesn't parse, with the error shown, so that I can't break Claude's settings by a typo.
21. As Andreas, I want hook scripts to open as text and never be run, so that viewing one is safe.
22. As Andreas, I want files in an adopted folder to open read-only with a note saying why, so that the app keeps its rule of never writing there.
23. As Andreas, I want an item the Work account shares with Personal labelled "shared with Personal", so that I know an edit changes both accounts.
24. As Andreas, I want "Create" on a workspace without a repo CLAUDE.md or a CLAUDE.local.md, opening an empty file in the editor that is written on first save, so that I can start one in place.
25. As Andreas, I want to be warned before leaving a file with unsaved edits, so that I don't lose them.
26. As Andreas, I want the layers to be re-read when I open Context, switch workspace, come back to the window, or save, so that what I see matches disk.
27. As Andreas, I want the view to say plainly that counts are estimates "as configured", so that I don't take them as a live chat's /context.
28. As Andreas, I want a workspace whose folder is gone to show that instead of empty layers, so that I know why nothing is listed.

## Implementation Decisions

- **New view id `context`** after `board` in the app's view list and sidebar, with the Ctrl+4 shortcut. An unknown saved view still falls back to the Dashboard.
- **Context reader (main process), the one deep module.** Input: a workspace (path, account profile). Output: a context report, with no UI types in it:
  - `layers`: `account`, `repo`, `local`, each with items. An item has: kind (`claude-md`, `import`, `subfolder-claude-md`, `memory-index`, `memory-file`, `skill`, `agent`, `command`, `mcp-server`, `plugin`, `settings`, `hook`), a label, an absolute path when it has a file, a source (`account`, `plugin:<name>`, `repo`, `project-entry`), estimated tokens when it counts at start (else none), `sharedWithDefault`, `readOnly` with a reason, and children (imports).
  - `startTotal` (the sum of counted items) and `missing` (which creatable files are absent: repo CLAUDE.md, CLAUDE.local.md).
  - The account layer reads the workspace profile's config folder. Memory lives in that folder's `projects/<sanitised cwd>/memory`, using the existing sanitising rule for transcript folders.
- **Token estimate:** characters ÷ 4, rounded, shown as "~N" or "~N.Nk". Skills and agents count only their frontmatter name and description; the body is not counted.
- **Imports:** `@path` references in CLAUDE.md, relative to the importing file or absolute or `~`, followed to 5 steps deep, each file once (no cycles). An import that can't be found shows as missing and counts 0.
- **Parent CLAUDE.md files:** every CLAUDE.md from the workspace folder's parent up to the drive root counts in the repo layer, as Claude loads them.
- **Subfolder CLAUDE.md files:** found under the workspace folder, skipping `node_modules`, `.git` and anything the repo's .gitignore hides. Listed, not counted.
- **MCP servers:** from the account's `.claude.json` (top level and the project entry for the workspace path) and the repo's `.mcp.json`. Name and source only. Tools are never counted and servers are never started.
- **Plugins:** `enabledPlugins` from the settings layers. Their skills, agents and commands are read from the plugin cache and sourced `plugin:<name>`.
- **Shared with Personal:** an item is shared when its path in a non-default profile's folder resolves, through the profile links, to the default profile's item.
- **Adopted folder:** every item under an adopted profile's folder is `readOnly` with the reason "adopted folder: the app never writes here".
- **Context file write (main process), a guarded write:** it accepts only a path that the latest report for that workspace listed and that isn't `readOnly`, or one of the two creatable files the report marked missing. A `.json` file must parse first, else the write returns the parse error. It never runs anything. This is separate from the workspace-folder file write Work's editor uses, which stays as it is.
- **Renderer:** a Context view with three panes (workspace list, layers, editor), reusing the Monaco editor setup from Work's editor and the account grouping from the Work list. Re-read on view open, on workspace switch, on window focus and after a save. A guard against leaving unsaved edits, as Work's editor has.
- **IPC:** read the report for a workspace, read a listed file's text, write a listed file, and get the start totals for all workspaces for the list.

## Testing Decisions

- Good tests here check what a user would see from a real arrangement of files: given these folders on disk, the report lists these items in these layers with these counts. They don't test how the reader walks the folders.
- **Seam 1, the context reader**, unit-tested against temp folders: a fake account config folder (CLAUDE.md, settings.json with hooks, allow rules and enabledPlugins, skills, agents, commands, `.claude.json` with MCP servers and a project entry, a plugin cache, memory), a fake repo (CLAUDE.md with nested and cyclic imports, CLAUDE.local.md, a subfolder CLAUDE.md, a gitignored folder holding a CLAUDE.md, `.mcp.json`, `.claude/settings.json` and `.claude/settings.local.json`), a parent-folder CLAUDE.md, a second profile linked to the first, and an adopted profile. Prior art: the local-sessions and profile-linker tests, which build real temp folders.
- **Seam 2, the guarded write**, unit-tested: it writes a listed file, refuses an unlisted path, refuses a read-only item in an adopted folder, refuses JSON that doesn't parse (with the error), and creates a missing repo CLAUDE.md.
- **Seam 3, one UI scenario** on the fake CLI with its temp config folder: Ctrl+4 opens Context, the row shows a start total, the layers list the seeded CLAUDE.md with its count, an edit plus Ctrl+S changes the file on disk, and broken JSON is refused. That makes 15 of the 20-scenario budget. Prior art: the existing UI scenarios that seed a temp config folder.
- Start totals are checked as exact numbers from the characters ÷ 4 rule on the seeded files.

## Out of Scope

- Editing in an adopted folder.
- Creating skills, agents, commands or memory files. Only the repo CLAUDE.md and CLAUDE.local.md can be created.
- Counting MCP tool definitions or starting MCP servers.
- Asking the CLI (/context, `claude mcp list`) for live numbers.
- Health checks: oversized files, duplicate rules, stale memory, broken hooks.
- Per-kind lists across all workspaces (a "where is this skill used" view).
- Managed or enterprise policy settings and environment-variable overrides.
- Watching files live; the view re-reads on the triggers above instead.

## Further Notes

- The counts follow Claude Code's loading rules as read from its behaviour today. If Claude changes how it loads context, the reader's unit tests are where the rules are pinned and updated.
- The "projects" folder is one of the items the Work account links to Personal, so memory for the same workspace path is shared too, and Context shows that with the same label.
