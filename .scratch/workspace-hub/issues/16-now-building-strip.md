# 16: "Now building" strip with a progress bar per active feature

**What to build:** a compact **Now building** strip at the top of the Board shows every feature being worked on right now. Each one gets a progress bar, the ticket in progress, the live session status and the latest progress note, so Andreas can see at a glance what is moving and how far along it is.

**Blocked by:** 15

**Status:** in-progress

- [x] The board model carries, per feature, its **last activity time**: the newest modification time of its `spec.md`, `progress.md`, ticket files and ticket `.progress.md` files, across every worktree copy. The board reader gets it through the injected file reader (a stat call); the reader still never writes.
- [x] A feature is **active** when any of these holds: (a) any of its tickets is in the In progress column; (b) its last activity is within the last 24 hours; (c) a hosted session in one of its workspaces is Running, and this feature is that workspace's most recently active feature. A finished feature (every ticket done) counts as active only through (b), and its row shows "finished".
- [x] The strip sits above the toolbar: a "Now building" heading with the number of active features, and a collapse toggle (remembered). It shows one row per active feature, newest activity first. At most 6 rows show; the rest sit behind "+N more".
- [x] Each row shows: repo icon (+ worktree tag when the activity is only in a worktree), feature name, a progress bar with done/total, the in-progress ticket(s) as `#NN title` (first one, then "+N"), the most urgent session status among the feature's workspaces (dot and label: Running / Needs approval / Your turn / Idle), the last non-empty line of `progress.md` (one line, truncated), and the time since the last activity ("2m ago", "3h ago").
- [x] Clicking a row sets the board's feature filter to that feature, and clicking it again clears it. The row shows as selected while the filter is on.
- [x] Activity times refresh with the board's existing watcher. "Time ago" labels tick every minute without a re-read.
- [x] When nothing is active, the strip shows one muted line, "Nothing in progress", and stays out of the way.
- [x] Tests (pure): activity time picks the newest file across worktree copies; the active rule covers (a), (b), (c), the 24-hour edge, and a finished feature active only through (b); ordering is newest first; the 6-row cap with "+N more"; the session status shown is the most urgent; and "time ago" formatting.
