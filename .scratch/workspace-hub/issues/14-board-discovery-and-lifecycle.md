# 14: Board finds every repo with tickets and reads the ticket lifecycle

**What to build:** the board shows the tickets Andreas actually has. It scans for repos with a `.scratch/` that aren't added yet and offers to add each one. It reads the canonical ticket lifecycle, including `in-progress` and `blocked`, and maps the older status words already on disk to the right columns.

**Blocked by:** 04, 11

**Status:** in-progress

- [ ] Discovery: scan the scan roots (default `C:\projects` and `C:\darkfall64`, editable in a small board settings popover, saved in the app's data folder) for git repo folders up to 3 levels deep that hold at least one `.scratch/<feature>/` with a `spec.md` or an `issues/` folder. Skip `node_modules`, `.git`, `Library`, `Temp` and hidden folders. Rescan on board open and every 5 minutes.
- [ ] Discovered repos that aren't added appear in a "Not added" strip on the board: repo name, feature count, open ticket count, and an **Add workspace** button that adds the main checkout. Worktrees of an added repo that carry their own `.scratch` are listed under it with their own Add button.
- [ ] Discovered repos' tickets are not shown on the board until added (board shows added workspaces only, as decided)
- [ ] The status word is the first word of the status line after the label, lower-cased, ending at whitespace or an em dash; any text after it is the status note
- [ ] Canonical words map: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human` → Backlog; `in-progress` → In progress; `blocked` → Blocked; `resolved`, `wontfix` → Done
- [ ] Legacy words map: `done`, `complete`, `completed`, `closed` → Done; `claimed`, `doing`, `wip` → In progress. Any other word → Backlog with an "unknown status" badge that shows the raw line
- [ ] The existing rules still apply: an unresolved ticket in `Blocked by` → Blocked; a ticket's own `.progress.md` → In progress
- [ ] Cards and the drawer show the status note when there is one
- [ ] Fixture tests cover: every canonical word, every legacy word, an unknown word, a note after an em dash, free text after the word (`resolved for groups 1 and 2 (2026-11-20)` → Done with that note), and discovery over a temp folder tree (repo with `.scratch`, repo without, nested `node_modules` skipped, depth limit)
- [ ] Real-data check: darkfall64's `done` tickets land in Done, and FantasySurvival's `talking hint resolved …` shows the unknown-status badge
