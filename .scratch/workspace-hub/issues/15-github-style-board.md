# 15: GitHub Projects-style board, slim discovery banner, wide reading panel

**What to build:** the board reads like a GitHub Projects board. Four full-height columns sit side by side, each scrolling on its own, with ticket cards stacked inside. Discovery shrinks to one line. Clicking a card opens a wide reading panel. This replaces 04's feature-row layout (feature rows, per-row mini-columns) and 14's full-width Not added strip. The board reader and its rules are unchanged.

**Blocked by:** 14

**Status:** ready-for-agent

- [ ] Layout: four columns (Backlog, Blocked, In progress, Done) side by side at full height, each with a header showing its name and card count, each scrolling independently. Cards stack vertically. No feature rows.
- [ ] Card: repo icon (+ worktree tag when the card was only seen in a worktree), a feature label chip, `#NN` and the ticket title (wrapping to max 3 lines), the status word and its note, "blocked by NN, NN" when it has unresolved blockers, a small "N copies" marker when seen in more than one worktree, and the workspace's session status dot.
- [ ] Toolbar above the columns: repo filter, feature filter (multi-select, lists features of the selected repos), text search over number, title and status note, and **Group by**: none (default), feature, repo. Grouping splits the board into collapsible swimlanes. Each swimlane header has the repo icon, name and the progress bar (done/total plus last note).
- [ ] Done column: cards of finished features (every ticket done) are hidden by default behind one line at the column's bottom: "+N from M finished features · show". Spec-only features show as one muted card in Backlog: "<feature> — spec only, no tickets yet".
- [ ] Card order within a column: repo, then feature name, then ticket number (02 < 02b < 03).
- [ ] Discovery: the Not added strip is replaced by one slim line above the toolbar, e.g. "3 repos with tickets aren't added · Review", and nothing when there are none. **Review** opens a small dialog listing repos only, each with feature count, open ticket count and **Add workspace**. Worktrees are hidden unless "show worktrees" is ticked in that dialog. Counts there merge worktree copies the same way the board does.
- [ ] Reading panel: clicking a card opens a side panel about 50% of the window wide (resizable, min 420 px), with the fully rendered ticket, its progress notes, its status line, and its blockers as links that select those cards. **Open session** works as before. Esc closes it; ↑/↓ step to the previous/next card in the same column; the selected card is highlighted.
- [ ] Filters, group-by and the "show finished" toggle are remembered between launches.
- [ ] Tests (pure layout helpers): card order, the finished-features hiding and its "+N from M" counts, filter + search, group-by producing swimlanes, ↑/↓ neighbour selection, and discovery dialog counts merging worktree copies.
