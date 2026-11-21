# 03: Board view with four columns

**What to build:** a Board view, reached from a Sessions | Board toggle in the title bar or Ctrl+1 / Ctrl+2. It shows one read-only card per ticket from every workspace's `.scratch/`, sorted into Backlog, Blocked, In progress and Done, and updates live as files change. This is spec seam 1, the board reader.

**Blocked by:** 02

**Status:** resolved

- [x] A pure board reader takes (list of workspaces, file reader) and returns the board model; a watcher on each workspace's `.scratch/` triggers a debounced re-read and pushes the model to the renderer
- [x] A feature is one `.scratch/<name>/` folder. Its tickets are `issues/NN-*.md`. Its notes are `progress.md`. A ticket's own notes are `issues/NN-*.progress.md`. Other files are ignored.
- [x] Status and Blocked by are read from lines matching `Status:` / `**Status:**` and `Blocked by:` / `**Blocked by:**`, ignoring case and markdown bold. "None…" in Blocked by means no blockers. Ticket numbers are read from the list.
- [x] Column: resolved or wontfix → Done. Any listed blocker not resolved → Blocked. Claimed, or own progress file exists → In progress. Otherwise → Backlog.
- [x] Worktree merge: tickets with the same repo group, feature name and ticket number merge into one card. The status rank is Backlog < Blocked < In progress < Done; the card keeps the highest one plus the list of workspaces it was found in.
- [x] The board never writes ticket files (ADR 0002)
- [x] Fixture tests cover: both Status styles; missing status; Blocked by "None" vs a list with one unresolved blocker; claimed and progress-file In progress; worktree copies with different statuses merging to the highest; junk files ignored
