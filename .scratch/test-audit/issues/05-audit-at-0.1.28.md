# 05: Scheduled test audit at 0.1.28

**What to build:** the scheduled test audit (release.md step 5), run on `main` at 0.1.28 before the release. main has 13 UI scenarios at 94.0 s by a JSON run, inside the 20-scenario, 200 s budget; four areas came in since 0.1.23 (Context map tour, Dashboard drawer, Processes tab, Test tab) and the Context cleanup builder was removed, so the pass looks for overlap there and for tests of code that is gone.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] **Inventory:** add a "0.1.28" section to `.scratch/test-audit/inventory.md`: every scenario with today's runtime from a JSON reporter run, what it proves, its unit-test overlap, and whether it guards a bug that reached Andreas (those stay).
- [x] **Trim:** merge scenarios that can share one app launch; delete what unit tests or other scenarios already cover. Every removed assertion lives on somewhere; list where.
- [x] **Unit tests (light pass):** duplicates, tests of deleted code (anything left of the Context cleanup builder), tests that only restate a copied constant; before/after count.
- [x] **Release doc:** "Audit due" line: ran at 0.1.28, next due at 0.1.33.
- [x] **Proof:** quick green; the full UI suite green; a before/after table.

## Answer

13 → 12 UI scenarios: the two Context scenarios share one launch (Files first, then the Map tour, which clicks the workspace once to read the newly seeded MEMORY.md). No assertion removed, nothing deleted outright, every regression guard unchanged. JSON totals: 94.0 s before, **84.8 s** after (green, no rerun). Unit tests: `agentReport` had no production caller since the Agents tab moved to summaries; it and its test are gone, and its relay-notice assertion now runs against `agentFileEnd`. Nothing was left of the cleanup builder. 1,439 → 1,438 (+2 skipped). Details: the 0.1.28 section of `.scratch/test-audit/inventory.md`.
