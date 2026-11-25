# Context view: preview-first editor, grouped layers and context cleanup

Status: ready-for-agent

## Problem Statement

The Context view works but reads like a raw file list. Each layer is one flat list of rows ("kind word · name · tokens · badges"), so a layer with 24 skills buries its CLAUDE.md and memory. Every file opens straight into a code editor, so reading a CLAUDE.md or a memory file means reading raw markdown, and a stray keystroke in settings.json is one Ctrl+S from being saved.

Separately, context drifts. Memory files, CLAUDE.md files, the glossary and ADRs describe the project as it was when they were written; the code moves on and nobody rechecks them. Andreas has to remember to ask Claude to audit them, and type out what to check and where the files live, per project and per account.

## Solution

**Look.** Inside each layer (Account, Repo, Local) items are grouped by kind: CLAUDE.md, Memory, Skills, Agents, Commands, MCP servers, Plugins, Settings & hooks. Each group has a small icon, a count and its token sum, and can be folded. Above the layers, the start total gets a slim bar showing each layer's share. Badges become quieter.

**Preview first.** Clicking an item opens it for reading: a markdown file is shown rendered (frontmatter as a small header card), any other file in a read-only code view. An **Edit** button switches to the text editor with **Save** and **Cancel**. Save or Ctrl+S saves and flips back to the preview; Cancel or Esc goes back too, asking first if there are unsaved edits. A save that fails (broken JSON) stays in edit mode with the error. Read-only files (adopted folder) have no Edit button. "Create CLAUDE.md" opens straight in edit mode.

**Context cleanup.** A **Clean up** menu in the layers header starts a new session in the selected workspace (on its account) with a prepared prompt waiting in the input box. Andreas can tweak it, pick model and effort, then press Enter. Three kinds:
- **This project:** the workspace's memory and repo files.
- **Account:** the account's own CLAUDE.md, skills, agents, commands, settings.
- **Across projects…:** a dialog lists the account's workspaces as checkboxes (all ticked); the run covers the ticked workspaces plus the account files.

The prompt tells Claude to send subagents to verify every claim in those files against the current code, show a findings table, and ask Andreas (clickable questions) which fixes to apply. Nothing is edited before he picks. Folders outside the workspace that the prompt names are pre-allowed for the session, so reading them doesn't prompt per folder.

## User Stories

1. As Andreas, I want each layer's items grouped by kind, so that a layer with many skills doesn't bury its CLAUDE.md and memory.
2. As Andreas, I want each kind group to show an icon, a count and its token sum, so that I see what costs what at a glance.
3. As Andreas, I want to fold a kind group, so that long lists like skills get out of the way.
4. As Andreas, I want the group order fixed (CLAUDE.md, Memory, Skills, Agents, Commands, MCP servers, Plugins, Settings & hooks), so that every layer reads the same way.
5. As Andreas, I want kinds with no items left out of a layer, so that empty headings don't add noise.
6. As Andreas, I want imports to stay nested under the CLAUDE.md that imports them, so that the import chain stays visible.
7. As Andreas, I want a bar under the start total showing each layer's share, so that I see where a bloated total comes from.
8. As Andreas, I want badges (shared with Personal, read-only, tools not counted, not found) quieter than today, so that rows are easy to scan.
9. As Andreas, I want a markdown file to open rendered, so that I read CLAUDE.md and memory the way they were written to be read.
10. As Andreas, I want a markdown file's frontmatter shown as a small header card, so that a skill's or memory's name and description are easy to read.
11. As Andreas, I want a non-markdown file to open in a read-only code view, so that I can read settings and hook scripts without risk.
12. As Andreas, I want an Edit button to switch an open file to the text editor, so that editing is a deliberate step.
13. As Andreas, I want Save and Cancel buttons while editing, so that I don't depend on shortcuts.
14. As Andreas, I want Ctrl+S to save and flip back to the preview, so that saving ends the edit.
15. As Andreas, I want Esc and Cancel to leave edit mode, asking first when there are unsaved edits, so that I don't lose work by accident.
16. As Andreas, I want a failed save (broken JSON) to keep me in edit mode with the error shown, so that I can fix it at once.
17. As Andreas, I want read-only files to show no Edit button, with the existing note saying why, so that I don't try to edit something the app won't write.
18. As Andreas, I want "Create CLAUDE.md" and "Create CLAUDE.local.md" to open straight in edit mode, so that I don't stare at an empty preview.
19. As Andreas, I want the unsaved-edits guard to keep working when I switch file, workspace or view while editing, so that nothing is lost.
20. As Andreas, I want the preview to refresh from disk on the existing triggers (focus, switch, save), so that what I read matches disk.
21. As Andreas, I want a Clean up menu in the layers header, so that starting a cleanup is one click from the context I'm looking at.
22. As Andreas, I want "This project" cleanup to cover the workspace's memory folder, its CLAUDE.md files and imports, CLAUDE.local.md, subfolder CLAUDE.md files, the repo's .claude skills, agents and commands, GLOSSARY.md, docs/adr and docs/agents, so that project drift is checked in one go.
23. As Andreas, I want "Account" cleanup to cover the account's CLAUDE.md and its imports, its skills, agents, commands and settings, so that my working-style files are checked too.
24. As Andreas, I want "Across projects…" to let me tick which of the account's workspaces to include, all ticked by default, so that I can check several projects plus the account in one run.
25. As Andreas, I want the cross-project dialog to list only the selected workspace's account's workspaces, so that one run never mixes account files.
26. As Andreas, I want the cleanup to start a new session in the selected workspace on its account, so that it runs where I already am.
27. As Andreas, I want the prepared prompt waiting in the input box, not sent, so that I can tweak it and pick model and effort first.
28. As Andreas, I want the prompt to name the actual file and folder paths from the Context report, so that Claude doesn't have to hunt for them.
29. As Andreas, I want the prompt to tell Claude to use subagents that verify each claim against the current code, so that the check is thorough and the main chat stays lean.
30. As Andreas, I want the prompt to tell Claude to show a findings table and ask me which fixes to apply before editing anything, so that I stay in control of what changes.
31. As Andreas, I want the folders the prompt names outside the workspace pre-allowed for that session, so that reading them doesn't ask permission per folder.
32. As Andreas, I want those pre-allowed folders kept when the session's process restarts or the session is resumed after an app restart, so that a long cleanup isn't interrupted by prompts.
33. As Andreas, I want the Clean up menu hidden when the workspace folder is gone, so that I can't start a cleanup of nothing.
34. As Andreas, I want the cleanup refused with a warning while I have unsaved edits in Context, using the existing leave guard, so that switching to Work doesn't lose them.

## Implementation Decisions

- **Kind grouping (shared, pure).** A function takes one layer's items and returns ordered groups: `{ kind group, items, count, tokens }`. Group order and membership:
  - CLAUDE.md: `claude-md`, `subfolder-claude-md` (imports stay children of their CLAUDE.md, not a group of their own)
  - Memory: `memory-index`, `memory-file`
  - Skills: `skill` · Agents: `agent` · Commands: `command` · MCP servers: `mcp-server` · Plugins: `plugin`
  - Settings & hooks: `settings`, `hook`
  - Empty groups are dropped. A group's tokens is the sum of its items' counted tokens including imports; null when nothing in it counts.
  - The "Loads when Claude works there" section for subfolder CLAUDE.md files stays as today.
- **Layer share bar:** account, repo and local start tokens as a share of the start total, one segment each, labelled in its tooltip. Hidden when the start total is 0.
- **Kind groups fold** with the existing collapsible section; open by default except Skills, Agents and Commands when they hold more than 8 items. Fold state is not saved.
- **Editor mode** lives in the Context store as `mode: 'preview' | 'edit'` on the open file:
  - Opening a listed file: `preview`. Opening a creatable (missing) file: `edit`.
  - `startEdit` only when not read-only. `save` success → `preview`; failure → stays `edit` with the error. `cancel` → asks through the existing discard confirm when dirty, then restores the saved text and goes to `preview`.
  - Ctrl+S saves only in `edit`. Esc cancels only in `edit`, and only when Monaco has no open widget (find box, suggestions), so Esc still closes those first.
  - Refresh on focus re-reads the file only when it is unedited, as today.
- **Preview rendering:** markdown files (`.md`) render with the app's existing Markdown component. Leading `---` frontmatter is stripped from the body and shown as a header card of its key/value lines. Links behave as they do in chat (no opening listed files in Context). Other files show in Monaco, read-only.
- **Cleanup prompt builder (shared, pure, the one deep module).** Input: the cleanup kind and the facts it needs: the account's name and config folder, and for each covered workspace its name, path, memory folder and Context report. Output: `{ prompt: string, addDirs: string[] }`.
  - The Context report gains `accountFolder` (the profile's config folder) and `memoryFolder` (where this workspace's memory lives, whether or not it exists yet), so the builder never re-derives paths.
  - The prompt lists the files to check by path, taken from the report: for a project, the repo and local layers' CLAUDE.md files, imports, subfolder CLAUDE.md files, repo skills, agents and commands, plus the memory folder, and `GLOSSARY.md`, `docs/adr/` and `docs/agents/` when they exist in the workspace; for the account, the account layer's CLAUDE.md files and imports, the account's own skills, agents, commands and settings (plugin items are left out: they belong to the plugin, not to Andreas).
  - The prompt's instructions, in order: (1) one subagent per covered project, plus one for the account files when covered; (2) each subagent checks every concrete claim (paths, commands, scripts, names, versions, "currently…" statements, links, `[[memory]]` links, MEMORY.md index lines against the files) against the current code and git history, and flags duplicates between files and contradictions between layers; (3) the main session merges the results into one findings table per file: stale, wrong, duplicate, structural, or fine, each with the evidence; (4) it asks Andreas through clickable questions which fixes to apply, and edits nothing before he answers; (5) account files are shared by every workspace of the account, so the prompt says so next to any account-file fix.
  - `addDirs`: every folder the prompt names that is outside the session's workspace (the memory folder, the account folder, the other workspaces), each once.
  - The prompt is fixed text in the app; only the paths and names vary.
- **Pre-allowed folders on the session.** A hosted session gains an optional list of added folders, stored with the session as model and permission mode are, and passed to the CLI as one `--add-dir <folder>` per entry on every spawn of that session (start, restart, resume). Sessions started any other way have none, so their launch is unchanged.
- **Starting a cleanup.** Session navigation's start-session path gains options: a draft for the new chat's input, and the added folders. The draft is placed through the existing per-chat draft store before the chat mounts, so the input box opens with it. It is never sent automatically. The Context view's leave guard runs first; if Andreas keeps unsaved edits, nothing starts.
- **Clean up menu:** a button in the layers header (next to the start total) opening a menu: "This project", "Account", "Across projects…". "Across projects…" opens a dialog with the selected workspace's account's workspaces as checkboxes (all ticked), the account files always included, and a Start button disabled when none is ticked. The dialog reads each ticked workspace's report before building the prompt; a workspace whose folder is gone is listed but cannot be ticked.

## Testing Decisions

- Good tests here check what Andreas would see or what Claude would be told, from a real arrangement of files: given these reports, the prompt names these paths and these folders get added; given these items, these groups appear in this order with these sums. They don't test how the view lays out rows.
- **Seam 1, the cleanup prompt builder**, unit-tested with report fixtures: each of the three kinds names the right files and leaves the others out (no account files in a project run; no plugin items; GLOSSARY/ADR only when present); `addDirs` holds exactly the outside folders, each once, and never the session's own workspace; the prompt carries the "ask before editing" and "one subagent per project" instructions. Prior art: the reader tests in the context module and the shared context tests.
- **Seam 2, kind grouping**, unit-tested in the shared context tests: order, empty kinds dropped, sums including imports, null when nothing counts.
- **Seam 3, the UI**, on the fake CLI:
  - The existing Context scenario is rewritten for preview-first: the CLAUDE.md opens rendered, Edit, type, Ctrl+S writes the file and the view is back in preview; broken JSON is refused and stays in edit mode. Still one scenario.
  - One new scenario: Clean up → This project opens Work on a new session whose input holds a prompt naming the workspace's CLAUDE.md, and after sending, the fake CLI's logged argv contains `--add-dir` with the memory folder. That makes 16 of the 20-scenario budget.
- The session spawn's `--add-dir` arguments are covered by that UI scenario through the fake CLI's argv log; no separate test.

## Out of Scope

- Opening listed files from links in the preview.
- Editing the cleanup prompt in Settings, or saving tweaked versions.
- Sending the prompt automatically, or picking a model or effort for the cleanup session.
- Cross-project runs that mix accounts.
- Running a cleanup on a schedule, or tracking when a workspace was last cleaned.
- Showing cleanup results inside the Context view; they live in the session.
- Split view (preview beside editor) or live preview while typing.
- Health checks in the Context view itself (oversized files, duplicates, stale memory).

## Further Notes

- The `memory-audit` skill walks memory one decision at a time with Andreas; the cleanup prompt is self-contained and doesn't depend on that skill existing in the account.
- The cleanup session's edits to account files change every workspace of that account, and both accounts where the item is shared with Personal; the prompt says so, and Context already labels shared items.
