# 04: Feature progress, finished strip, filters and ticket drawer

**What to build:** the board groups cards by feature, each with a progress bar and its latest note. Finished features fold away, the board can be filtered, and a card opens a ticket drawer that can jump to the workspace's session.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] Feature progress is Done tickets out of total, plus the last non-empty line of `progress.md`
- [ ] All done → finished: shown as one line in a Finished features strip that expands, not in the Done column
- [ ] A spec but zero tickets → shown as "spec only"
- [ ] Filter chips by repo group and by workspace
- [ ] Clicking a card opens a side drawer with the rendered ticket, its progress notes and blockers, and an Open session button that switches to Sessions on that workspace
- [ ] Fixture tests cover a finished feature and a spec-only feature
