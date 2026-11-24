# 01: Context view with CLAUDE.md layers and start totals

**What to build:** the tracer bullet of the Context view (spec: `.scratch/context-view/spec.md`). A fourth view, **Context**, after Board in the sidebar, opened with **Ctrl+4**. An unknown saved view still falls back to the Dashboard. The left pane is the workspace list, grouped by account like Work's, each row with its start total (for example "command-center · ~4.2k"), starting on the workspace last open in Work. The middle pane shows the selected workspace's context layers in the order they apply (account → repo → local), read-only in this ticket, with the start total at the top and the label that counts are estimates "as configured". This ticket builds the context reader (main process, the one deep module) for the CLAUDE.md family only; later tickets add the other kinds to the same reader and report.

Reader rules (from the spec, word for word):
- The account layer reads the workspace profile's config folder.
- **Token estimate:** characters ÷ 4, rounded, shown as "~N" or "~N.Nk".
- **Imports:** `@path` references in CLAUDE.md, relative to the importing file or absolute or `~`, followed to 5 steps deep, each file once (no cycles). An import that can't be found shows as missing and counts 0.
- **Parent CLAUDE.md files:** every CLAUDE.md from the workspace folder's parent up to the drive root counts in the repo layer, as Claude loads them.
- **Subfolder CLAUDE.md files:** found under the workspace folder, skipping `node_modules`, `.git` and anything the repo's .gitignore hides. Listed, not counted. Shown under "loads when Claude works there".
- CLAUDE.local.md is in the local layer and counts.
- **Shared with Personal:** an item is shared when its path in a non-default profile's folder resolves, through the profile links, to the default profile's item. Label: "shared with Personal".
- **Adopted folder:** every item under an adopted profile's folder is `readOnly` with the reason "adopted folder: the app never writes here".
- Report shape: `layers` (`account`, `repo`, `local`), each with items. An item has: kind, a label, an absolute path when it has a file, a source, estimated tokens when it counts at start (else none), `sharedWithDefault`, `readOnly` with a reason, and children (imports). Plus `startTotal` (the sum of counted items) and `missing` (which creatable files are absent: repo CLAUDE.md, CLAUDE.local.md). No UI types in it.
- IPC: read the report for a workspace; get the start totals for all workspaces for the list.
- Re-read on view open, on workspace switch and on window focus.
- A workspace whose folder is gone shows that instead of empty layers.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Ctrl+4 and the sidebar open Context; Ctrl+1/2/3 are unchanged.
- [ ] The workspace list is grouped by account with a start total per row, and starts on the last Work workspace.
- [ ] The layers pane shows the account, parent and repo, and local CLAUDE.md files with "~N" counts, imports nested under their importer, subfolder files under "loads when Claude works there" without counts, and the start total.
- [ ] "shared with Personal" and the adopted-folder read-only reason appear on the right items.
- [ ] A missing workspace folder shows as such.
- [ ] Unit tests (seam 1) against temp folders: an account CLAUDE.md, a parent-folder CLAUDE.md, a repo CLAUDE.md with nested and cyclic imports and a missing import, CLAUDE.local.md, a subfolder CLAUDE.md, a gitignored folder holding a CLAUDE.md, a second profile linked to the first, and an adopted profile. Start totals checked as exact numbers from the characters ÷ 4 rule. Prior art: the local-sessions and profile-linker tests.
- [ ] Quick tier green.
