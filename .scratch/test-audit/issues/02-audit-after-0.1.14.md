# 02: Scheduled test audit (overdue since 0.1.13)

**What to build:** the release rule in `docs/agents/release.md` calls for a test audit every 5th release. The last one was at 0.1.8 (ticket 01). Since then 6 releases added features, and each one extended scenarios. Current state at 0.1.16: 18 UI scenarios, **85–89.6 s** of the 90 s budget on a quiet machine, and 1,023 unit tests. Releases 0.1.15 and 0.1.16 landed after this ticket was written; include their changes (compact sidebar repo groups, popover clamp, scroll leave-on-wheel).

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] **Inventory:** list every UI scenario with its runtime (JSON reporter), its steps, and what each step proves. Flag steps that duplicate a unit test, or test behaviour that has since been replaced, for example:
  - the old Past sessions modal, now the picker;
  - the media column, now a tab;
  - nested subagent messages, now compact rows;
  - the per-turn cost, now removed;
  - status headings, now the compact sidebar.

  Append the result to `.scratch/test-audit/inventory.md` under a "0.1.14" heading.
- [ ] **UI suite:**
  - remove dead or duplicate steps;
  - shorten waits that prove nothing (keep the ones that prove "nothing happens too early", as ticket 01 did);
  - **target ≤ 75 s** on a quiet machine, leaving room for new features;
  - don't drop below the regression guards. These stay exactly: the send-mid-turn queue, the update busy gate (now including background tasks), scroll-follow, the observed cut-off, processTree, the window place, the storage flush before quit, the off-screen test windows and the zoom overflow.
- [ ] **Unit tests:** remove duplicates and tests of deleted code. Report the before and after count.
- [ ] **Release doc:** in `docs/agents/release.md`, record that this audit ran at 0.1.14 and the next is due at 0.1.19. Add one line to the release steps saying the conductor checks the "audit due" line before every release.
- [ ] **Proof:** `pnpm quick` green; `pnpm e2e:gate` green twice in a row on a quiet machine, with the time reported; the perf and zoom shots green. End with a before/after table: scenarios, UI time, unit count, quick time.
