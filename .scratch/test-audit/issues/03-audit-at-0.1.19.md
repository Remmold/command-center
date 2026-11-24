# 03: Scheduled test audit at 0.1.19

**What to build:** `docs/agents/release.md` says a test audit is due at 0.1.19. Since the last one (at 0.1.16+, ticket 02):
- 0.1.17: quiet tool rows;
- 0.1.18: model and effort memory;
- 0.1.19: accurate agent status, own sidebar groups with drag sort.

Starting state: 14 UI scenarios, **74 s** of 90; 1,099 unit tests.

**Blocked by:** None (can start immediately)

**Status:** in-progress

- [x] **Inventory:** add a "0.1.19" section to `.scratch/test-audit/inventory.md`: every scenario with its runtime and steps. Flag dead or duplicate steps, especially:
  - checks of behaviour replaced since 0.1.16: repo groups, now own groups; IN/OUT boxes always open, now folded; status headings; the per-turn cost;
  - unit tests of deleted code.
- [x] **Trim:** remove dead and duplicate steps and tests; keep the regression guards exactly. Don't chase time below about 70 s; a healthy suite stays as it is.
- [x] **Release doc:** update the "Audit due" line: ran at 0.1.19, next due at 0.1.24.
- [x] **Proof:** quick green; `pnpm e2e:gate` green twice; the perf and zoom shots green; a before/after table.
