# 01: Claude Code section with the Account layer, Model & thinking, and a safe save

**What to build:** a Claude Code section in Settings (between Accounts and Apps) that edits the Account layer's settings.json of a chosen account profile, starting with the Model & thinking category, and saves through a save bar that writes only the changed keys, in place. This is the tracer bullet every later ticket builds on. Spec: `.scratch/claude-settings/spec.md` (user stories 1–8, 10–12, 44–48, 51–55, 57, 58; "Setting catalog", "Settings file module", "Renderer"). ADR 0007.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] A settings file module in the main process: read a file into `{ value, text, mtime, error? }`; apply a patch `{ set: {path: value}, remove: [path] }` against a base snapshot, returning the new text or the list of conflicting keys; write in place.
- [x] A patch touches only the paths it names. Unknown keys and key order stay; new keys go at the end. Output is 2-space JSON with a final newline.
- [x] A conflict is a patched path whose value on disk differs from the base the page read. With conflicts it writes nothing and returns them (the dialog that settles them is ticket 03; until then Save shows the conflicting keys as an error).
- [x] Writes go in place (never temp file + rename) through the same serial queue the model-defaults save already uses. That save moves onto this module, so both share one writer, and its existing tests still pass.
- [x] A file that does not parse is never written from a patch; the page shows the parse message and the layer can't be saved from the form.
- [x] Missing files and their parent `.claude` folder are created on Save.
- [x] Allowed targets: each account profile's `settings.json` and `keybindings.json` (adopted folders included), and each workspace's `.claude/settings.json` and `.claude/settings.local.json`. Any other path is refused. `.claude.json` and `.credentials.json` stay refused.
- [x] IPC: a `claudeSettings:` domain with read (account + workspace → all layers' snapshots and their paths) and save (target, base, patch).
- [x] The catalog's shape exists (key path, label, one-line description, category, control type, default, valid layers, terminal-only, applies-only-to-new-chats, advanced, optional risk rule) and holds the Model & thinking category's keys. Categories, in this order: Model & thinking, Permissions, Hooks, Interface, Memory & context, Git & attribution, MCP servers, Plugins & skills, Agents & worktrees, Remote & notifications, Updates, privacy & sign-in, Environment, Key bindings, Other keys.
- [x] Rows show a plain label, a one-line explanation, the raw key in small muted text under the label, the right control (toggle, choice, number, text, string list) and the default when nothing is set ("Default: on"). A choice control is added to `ui/` for lists longer than a segmented control fits.
- [x] The layer bar shows Account with an account picker listing every account profile; Repo and Local are visible but arrive in ticket 02. Accounts the app made say they share Personal's file. The Work account's adopted folder is editable.
- [x] The save bar ("3 changes · Review · Save · Discard"), the Review dialog (before and after per setting) and Discard work. Leaving the section, Settings or the view with unsaved changes asks first (the existing view leave guard, plus section switches and closing Settings).
- [x] Model picker and effort defaults in chats keep working and show the same values as this page.
- [x] Vitest: patch set/replace/remove keeps other keys, values and order; a conflict returns keys and writes nothing; an unparseable file is not written; a hard link is kept (a second link sees the change); a missing file and folder are created; disallowed paths are refused.
- [x] UI suite: one new scenario in a new `claudeSettings.spec.ts` on the fake CLI's temp config folder: open Settings → Claude Code, change a Model & thinking setting, check the save bar's count, save, check the file on disk has the new value and still has an unknown key it started with. `pnpm e2e:count` stays within 20.

## Comments

- Model & thinking holds `model` and `alwaysThinkingEnabled` for now. A top-level `effortLevel` row was left out: the chats' effort picker saves effort per model under `modelSettings.<model id>.effortLevel`, and the CLI reads that over a top-level `effortLevel`, so such a row would not show or set what chats use. Ticket 04 decides how effort appears on the page.
- Key paths in a patch are dot-separated; a key that holds a dot (a model id) goes through `keyPath(...)`, which escapes it.
