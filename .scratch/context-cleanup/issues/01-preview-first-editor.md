# 01: Preview-first editor in Context

**What to build:** clicking an item in Context opens it for reading instead of editing (spec: `.scratch/context-cleanup/spec.md`). Markdown is shown rendered with its frontmatter as a header card; any other file in a read-only code view. Edit switches to the text editor with Save and Cancel; saving or cancelling returns to the preview.

Rules (from the spec, word for word):
- **Editor mode** lives in the Context store as `mode: 'preview' | 'edit'` on the open file:
  - Opening a listed file: `preview`. Opening a creatable (missing) file: `edit`.
  - `startEdit` only when not read-only. `save` success → `preview`; failure → stays `edit` with the error. `cancel` → asks through the existing discard confirm when dirty, then restores the saved text and goes to `preview`.
  - Ctrl+S saves only in `edit`. Esc cancels only in `edit`, and only when Monaco has no open widget (find box, suggestions), so Esc still closes those first.
  - Refresh on focus re-reads the file only when it is unedited, as today.
- **Preview rendering:** markdown files (`.md`) render with the app's existing Markdown component. Leading `---` frontmatter is stripped from the body and shown as a header card of its key/value lines. Links behave as they do in chat (no opening listed files in Context). Other files show in Monaco, read-only.
- Read-only files (adopted folder) have no Edit button, with the existing note saying why.
- The unsaved-edits guard keeps working when switching file, workspace or view while editing.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] A `.md` item opens rendered; frontmatter shows as a header card, not raw text.
- [x] A non-`.md` item opens in read-only Monaco.
- [x] Edit → Save button and Ctrl+S save, then show the preview; Cancel and Esc return to preview, confirming first when dirty; Esc with Monaco's find box open closes the find box only.
- [x] A failed save (broken JSON) stays in edit mode with the error.
- [x] Read-only items show no Edit button.
- [x] Create CLAUDE.md / CLAUDE.local.md opens in edit mode.
- [x] The existing Context UI scenario is rewritten for preview-first: the CLAUDE.md opens rendered, Edit, type, Ctrl+S writes the file and the view is back in preview; broken JSON is refused and stays in edit mode. Still one scenario (15 of 20).
- [x] Quick tier green.
