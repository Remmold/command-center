# Claude Code settings: every Claude setting as plain controls

**Status:** ready-for-agent

## Problem Statement

Claude Code has around 200 settings spread over three settings files per workspace (account, repo, local) plus a key bindings file. To change any of them Andreas has to know the file exists, know the exact key name, know which file wins over which, and hand-edit JSON without breaking it. The app's Context view shows the files, but only as raw text. Nothing tells him what a setting does, what its allowed values are, which file a value comes from, or whether it even affects the chats in the command center.

## Solution

A new **Claude Code** section in Settings (between Accounts and Apps). It lists every setting Claude Code reads from a settings file, in plain words, divided into categories, with the right control for each one: toggles, choices, numbers, text, lists, and purpose-built editors for permissions, hooks, environment variables, the status line and key bindings.

- A **layer bar** at the top picks what is being edited: **Account** (with an account picker), **Repo** or **Local** (with a workspace picker). Each row shows the value in that layer and, beside it, the **effective value** for the chosen workspace, with a badge naming the layer it comes from ("From Account", "Overridden by Local", "Set by your organisation").
- Common settings come first in each category; rare ones are behind **Show advanced**. Settings only the organisation can set, and the macOS/Linux sandbox settings, are left out.
- Each setting carries a tag: **All chats** or **Terminal only**. A filter can hide terminal-only ones.
- A search box finds settings by label, description or raw key name.
- Entries the page has no control for appear under **Other keys**, with their raw value, editable and removable. Nothing in a file is ever dropped.
- Changes wait in a **save bar** ("3 changes · Review · Save · Discard"). Review shows before and after per setting. Save writes only the changed keys onto the file as it is on disk at that moment (ADR 0006). If Claude changed one of those keys meanwhile, Save asks which value to keep.
- The page watches its files and refreshes when Claude or anything else changes them.
- The Work account's adopted folder is editable here too, but only its settings.json and keybindings.json, and only on Save.

## User Stories

1. As Andreas, I want a Claude Code section in Settings, so that I can change Claude's setup without opening a config file.
2. As Andreas, I want the section between Accounts and Apps in the Settings sidebar, so that it sits with the other setup pages.
3. As Andreas, I want settings divided into categories (Model & thinking, Permissions, Hooks, Interface, Memory & context, Git & attribution, MCP servers, Plugins & skills, Agents & worktrees, Remote & notifications, Updates, privacy & sign-in, Environment, Key bindings, Other keys), so that I find related settings together.
4. As Andreas, I want every setting shown with a plain label and a one-line explanation, so that I understand it without reading docs.
5. As Andreas, I want the raw key name in small muted text under the label, so that I can match a setting to the docs or the file.
6. As Andreas, I want a toggle for on/off settings, a choice for settings with fixed values, a number field for numbers, and a text field for text, so that I can only enter values Claude accepts.
7. As Andreas, I want each control to show the default when nothing is set ("Default: on"), so that I know what happens if I leave it.
8. As Andreas, I want common settings first and rare ones behind Show advanced in each category, so that the page isn't overwhelming.
9. As Andreas, I want a search box that finds settings by label, description or key name, across all categories, so that I can jump straight to one.
10. As Andreas, I want a layer bar to pick Account, Repo or Local, so that I know which file I'm changing.
11. As Andreas, I want an account picker on the Account layer listing every account profile, so that I can edit Personal's or Work's settings.
12. As Andreas, I want accounts the app made to say they share Personal's file, so that I'm not surprised that a change reaches both.
13. As Andreas, I want a workspace picker on the Repo and Local layers, so that I can edit one workspace's files.
14. As Andreas, I want the Repo layer to say its file is committed and shared with everyone on the repo, so that I don't put personal choices there by mistake.
15. As Andreas, I want the Local layer to say it applies only to me in this folder, so that I know where personal overrides go.
16. As Andreas, I want each row to show the effective value for the chosen workspace next to the value in the layer I'm editing, so that I see what Claude will actually use.
17. As Andreas, I want a badge saying where the effective value comes from ("From Account", "Overridden by Local", "Set by your organisation"), so that I know why a change might not take effect.
18. As Andreas, I want settings the organisation sets shown locked with "Set by your organisation", so that I don't try to change what I can't.
19. As Andreas, I want a Reset action per row that removes the key from the layer I'm editing, so that the setting falls back to the next layer or the default.
20. As Andreas, I want each setting tagged All chats or Terminal only, so that I know whether it changes the chats in the command center.
21. As Andreas, I want a filter that hides terminal-only settings, so that I can focus on what affects my hosted chats.
22. As Andreas, I want settings Claude reads only at start (model, effort) to say "Applies to new chats", so that I know a running chat won't change.
23. As Andreas, I want a warning line on risky values (skip all permission prompts, turn off all hooks, allow every Bash command), so that I don't weaken my safety net by accident.
24. As Andreas, I want settings that only count in some layers to say so, and be read-only in the others (e.g. auto or bypass permission mode only from Account), so that I never save a value Claude ignores.
25. As Andreas, I want the Permissions editor to show Allow, Ask and Deny as three lists, so that I can see all my rules at a glance.
26. As Andreas, I want to add a rule by picking a tool (Bash, PowerShell, Read, Edit, Write, WebFetch, an MCP server, Agent, …) and typing a pattern, with a plain sentence of what it does ("Allow Bash commands starting with git status"), so that I don't need the rule syntax.
27. As Andreas, I want to move a rule between Allow, Ask and Deny, and remove it, so that I can tighten or loosen a rule in one step.
28. As Andreas, I want the Permissions editor to include the default permission mode, extra folders Claude may use, and the block-outside-folder switches, so that all permission choices are in one place.
29. As Andreas, I want the Hooks editor to list hooks per event (when they run), each with its matcher, type, command, timeout and status message, so that I can see and change what runs automatically.
30. As Andreas, I want each hook event explained in plain words ("Before a tool runs"), so that I pick the right one.
31. As Andreas, I want to add, edit, turn into another type and remove hooks of every type (command, prompt, agent, http, mcp tool), so that I never need the file for hooks.
32. As Andreas, I want the Environment editor as a table of name and value, so that I can set variables for Claude and its tools.
33. As Andreas, I want the name field to autocomplete every documented variable, so that I don't mistype one.
34. As Andreas, I want the useful variables to show a plain explanation and a typed input (on/off, number, text), so that I know what I'm setting.
35. As Andreas, I want secret-looking values (keys, tokens, secrets, passwords) masked until I click to show them, so that they don't sit on screen.
36. As Andreas, I want the status line editor to show the command and its options with a plain explanation, so that I can change or remove it.
37. As Andreas, I want a Key bindings category per account listing every action by context with its current key, so that I can see and change Claude's terminal shortcuts.
38. As Andreas, I want to set a key by pressing it in a capture field, including chords, so that I don't need the key syntax.
39. As Andreas, I want to unbind a key and reset a binding to the built-in default, so that I can remove a shortcut I hit by accident.
40. As Andreas, I want reserved keys (Ctrl+C, Ctrl+D, …) refused with a reason, so that I can't break Claude's terminal.
41. As Andreas, I want a banner on Key bindings saying they change terminal Claude, not this app's shortcuts, so that I'm not confused when the app doesn't react.
42. As Andreas, I want keys the page doesn't know listed under Other keys with their raw value, so that nothing in my file is hidden.
43. As Andreas, I want to edit or remove an Other key as JSON, checked before it can be saved, so that I can fix a typo or a stale key.
44. As Andreas, I want my changes to wait in a save bar with a count, so that I can make several changes and save them together.
45. As Andreas, I want Review to list every pending change with before and after, so that I see exactly what Save will write.
46. As Andreas, I want Discard to drop every pending change, so that I can back out.
47. As Andreas, I want leaving the section, Settings or the app with unsaved changes to ask first, so that I don't lose them by accident.
48. As Andreas, I want Save to write only the keys I changed onto the file as it is on disk right then, so that rules Claude added while the page was open are kept.
49. As Andreas, I want Save to ask which value to keep when Claude changed the same key since I opened it, so that neither change is lost silently.
50. As Andreas, I want the page to refresh when a file changes on disk, keeping my pending changes, so that I always see current values.
51. As Andreas, I want a file that isn't valid JSON shown as an error with its parse message, and not saveable from the form, so that the page never overwrites a file it couldn't read.
52. As Andreas, I want saving to keep the file's hard links, so that app-made accounts keep sharing Personal's settings.
53. As Andreas, I want a missing file created on first Save (including its .claude folder for Repo and Local), so that I can set a value in a layer that has no file yet.
54. As Andreas, I want Save to keep the file's key order and add new keys at the end, so that diffs of a committed repo file stay small.
55. As Andreas, I want to save the Work account's settings.json and keybindings.json here, so that I can manage both accounts in one place.
56. As Andreas, I want each layer to show the path of the file it edits, with a button to open it in the Context view, so that I can still look at the raw file when I want to.
57. As Andreas, I want the model picker's and effort's defaults in chats to keep working as before and show the same values as this page, so that there is one source of truth.
58. As Andreas, I want the whole page to work offline, so that it follows the app's offline rule.

## Implementation Decisions

**Setting catalog (shared, pure data)**
- One bundled catalog describes every setting the page shows: key path, label, one-line description, category, control type (toggle, choice with labelled options, number with range, text, string list, or a named purpose-built editor), default, which layers it is valid in, whether it is terminal-only, whether it applies only to new chats, whether it is advanced, and an optional risk rule (value → warning text).
- It covers every key that Claude Code documents as valid in user, project or local settings, except the sandbox keys and the managed-only keys. The categories are, in this order: Model & thinking, Permissions, Hooks, Interface, Memory & context, Git & attribution, MCP servers, Plugins & skills, Agents & worktrees, Remote & notifications, Updates, privacy & sign-in, Environment, Key bindings, Other keys.
- Layer rules from the docs go into the catalog: `permissions.defaultMode` values `auto` and `bypassPermissions` are only valid in the account layer; `modelPicker`, `askUserQuestionTimeout`, `autoMode`, `permissions.denyInsteadOfPrompting` and the other "user or managed" keys are account-only; `useAutoModeDuringPlan`, `syncClaudeAiSkills`, `syncClaudeAiPlugins` and `skipDangerousModePermissionPrompt` are not valid in the repo layer.
- Risky values with a warning: `permissions.defaultMode` = `bypassPermissions`; `disableAllHooks` = true; `skipDangerousModePermissionPrompt` = true; an Allow rule of bare `Bash`, `PowerShell` or `Bash(*)`.
- An environment-variable catalog lists every documented variable name. About 60–80 useful ones also carry a description and a value type. A value whose name contains KEY, TOKEN, SECRET or PASSWORD is masked.
- A key-binding catalog lists every context and action with its built-in default key, plus the reserved keys (Ctrl+C, Ctrl+D, Ctrl+M, Ctrl+[, Ctrl+I, Ctrl+H, Caps Lock).
- Merge rules for the effective value: higher layer wins in the order organisation > local > repo > account; arrays in `permissions.allow`/`ask`/`deny`/`additionalDirectories` and hooks combine across layers; `env` and other objects combine per key; the docs' exceptions (stricter values that beat higher layers) are encoded where the catalog marks them.

**Settings file module (main process, the deep module)**
- One module owns reading, patching and writing a Claude settings file and keybindings.json. Its interface: read a file into `{ value, text, mtime, error? }`; apply a patch `{ set: {path: value}, remove: [path] }` against a base snapshot, returning the new text or the list of conflicting keys; write in place.
- A patch touches only the paths it names, plus any parent object a removal leaves empty, which goes with it. Unknown keys and key order stay; new keys go at the end. Output is 2-space JSON with a final newline.
- The string lists Claude appends to itself (`permissions.allow`, `permissions.ask`, `permissions.deny`, `permissions.additionalDirectories`) are patched per item: the patch holds the items added and removed per list, and Save applies them to the list as it is on disk (add if absent, remove if present, the disk's order kept, new items at the end). An item Claude added meanwhile is kept and is never a conflict. A list left empty is removed, with any parent it empties.
- A conflict is a patched path whose value on disk differs from the base the page read (for an item list, only a value on disk that isn't a list). With conflicts it writes nothing and returns them. The renderer then asks per key (keep mine / keep the file's) and saves again with a new base.
- Writes go in place (never temp file + rename) through the same serial queue the model-defaults save already uses. That save moves onto this module, so both share one writer.
- A file that does not parse is never written from a patch.
- Missing files and their parent `.claude` folder are created on Save.
- Allowed targets: each account profile's `settings.json` and `keybindings.json` (adopted folders included), and each workspace's `.claude/settings.json` and `.claude/settings.local.json`. Any other path is refused. `.claude.json` and `.credentials.json` stay refused.
- Organisation layer, read only: `managed-settings.json` in the Windows system location and `remote-settings.json` in the account's folder, when present.
- Watching: the files of the layer and workspace on screen are watched (fs.watch with the polling backstop pattern used elsewhere). A change pushes a changed event with the new snapshot.
- IPC: a `claudeSettings:` domain with read (account + workspace → all layers' snapshots and their paths), save (target, base, patch), and a changed push event.

**Renderer**
- A new `claude-code` Settings section id and sidebar entry with its own category list beside the rows.
- A pending-changes store per target file (patch + base). The save bar, Review dialog and Discard read it. It hooks the existing view leave guard and also guards switching Settings sections and closing Settings.
- An incoming changed event refreshes snapshots and keeps pending edits; a pending key whose disk value changed is marked so Save will ask.
- Controls reuse the `ui/` primitives (Checkbox, SegmentedControl, TextField, SearchField, PropertyList, CollapsibleSection, Dialog, ConfirmDialog, Banner). A choice control is added to `ui/` for lists longer than a segmented control fits.
- Purpose-built editors: Permissions, Hooks, Environment, Status line, Key bindings, Other keys (raw JSON per key, parsed before it can be staged).
- The "Open in Context view" button opens the Context view on that workspace and file.

## Testing Decisions

Good tests check what Andreas would see or what lands on disk, never internal state.

1. **Settings file module** (Vitest, Node, temp folders), the main seam. Prior art: the model-defaults tests and the Context guard's tests.
   - A patch sets, replaces and removes nested keys and leaves every other key, its value and key order untouched.
   - A key changed on disk after the base was read comes back as a conflict, and nothing is written.
   - A file that does not parse is not written.
   - Writing keeps a hard link: a second link to the file sees the change.
   - Missing file and folder are created.
   - Paths outside the allowed targets are refused.
   - The model-defaults save still passes its existing tests after moving onto the module.
2. **Catalog and merge** (Vitest, pure).
   - Every catalog key is unique, belongs to a listed category, and every choice has options and a default among them.
   - A bundled snapshot of the published settings schema is a test fixture: every schema key valid outside managed settings, sandbox excepted, is in the catalog or on a written-down skip list.
   - The effective value follows the layer order and the array/object merge rules, with the organisation lock and the account-only `defaultMode` values.
   - The environment catalog has unique names; masking applies by name.
   - Key capture to binding text (`ctrl+k ctrl+s`) round-trips, and reserved keys are refused.
3. **UI suite**: one new scenario in a new `claudeSettings.spec.ts` (the suite is at 12 of 20 by `pnpm e2e:count`; the ui-polish flow may add one). It opens Settings → Claude Code on the fake CLI's temp config folder, finds a setting by search, changes it, checks the save bar's count, saves, and checks the file on disk has the new value and still has an unknown key it started with. Then it writes the file from outside and checks the page shows the new value.
4. **Lane 2** (Andreas): whether the categories, labels and explanations read clearly, and how the layer bar and badges feel.

## Out of Scope

- `~/.claude.json` (the 12 global keys and MCP servers there) and `.mcp.json`. The Context view keeps listing MCP servers.
- Sandbox settings (macOS/Linux/WSL only) and settings only an organisation can set.
- Writing organisation (managed) settings.
- CLAUDE.md, memory, skills, agents and commands (the Context view's).
- The app's own settings (General etc.).
- Fetching the catalog or docs at runtime.

## Further Notes

- The adopted-folder exception and ADR 0006 were written during the grilling.
- The CLI's `--setting-sources user,project,local` means hosted chats read all three layers, so the effective value shown is what hosted chats use (organisation settings apply on top).
- The Local file stays next to `.claude/settings.json` in the workspace folder on Windows, even inside a git repo.
