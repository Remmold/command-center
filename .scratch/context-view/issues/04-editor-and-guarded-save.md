# 04: Edit and save from Context

**What to build:** the right pane of Context is the app's own editor (spec: `.scratch/context-view/spec.md`). Clicking an item opens it, Ctrl+S saves, and the layers are re-read after a save. Reuse the Monaco editor setup from Work's editor.

Rules (from the spec, word for word):
- **Context file write (main process), a guarded write:** it accepts only a path that the latest report for that workspace listed and that isn't `readOnly`, or one of the two creatable files the report marked missing. A `.json` file must parse first, else the write returns the parse error. It never runs anything. This is separate from the workspace-folder file write Work's editor uses, which stays as it is.
- Hook scripts open as text and are never run.
- Files in an adopted folder open read-only with a note saying why ("adopted folder: the app never writes here").
- An item labelled "shared with Personal" keeps the label in the editor's header, so you know an edit changes both accounts.
- "Create" on a workspace without a repo CLAUDE.md or a CLAUDE.local.md opens an empty file in the editor that is written on first save.
- A guard against leaving unsaved edits, as Work's editor has.
- IPC: read a listed file's text, write a listed file.

**Blocked by:** 01, 02, 03

**Status:** ready-for-agent

- [ ] Clicking any item with a file opens it; Ctrl+S saves, and the layers and totals refresh.
- [ ] Invalid JSON is refused with the parse error shown, and nothing is written.
- [ ] Adopted-folder files are read-only with the note.
- [ ] Create works for a repo CLAUDE.md and CLAUDE.local.md, and the file is written on first save.
- [ ] Switching file, workspace or view with unsaved edits warns first.
- [ ] Unit tests (seam 2): it writes a listed file, refuses an unlisted path, refuses a read-only item in an adopted folder, refuses JSON that doesn't parse (with the error), and creates a missing repo CLAUDE.md.
- [ ] UI scenario (seam 3) on the fake CLI with its temp config folder: Ctrl+4 opens Context, the row shows a start total, the layers list the seeded CLAUDE.md with its count, an edit plus Ctrl+S changes the file on disk, and broken JSON is refused. That makes 15 of the 20-scenario budget.
- [ ] Quick tier and `pnpm e2e:gate` green.
