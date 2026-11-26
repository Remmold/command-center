# 06: Scheduled test audit at 0.1.33

**What to build:** the scheduled test audit (release.md step 5), run on `main` at 0.1.33 before the release. main has 18 UI scenarios at 123.7 s by a JSON run, inside the 20-scenario, 200 s budget; the feature cockpit scenarios (three) and the "main chat proposes a feature; Go starts it" scenario came in since 0.1.28, so the pass looks for overlap there.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] **Inventory:** add a "0.1.33" section to `.scratch/test-audit/inventory.md`: every scenario with today's runtime from a JSON reporter run, what it proves, its unit-test overlap, and whether it guards a bug that reached Andreas (those stay).
- [x] **Trim:** merge scenarios that can share one app launch; delete what unit tests or other scenarios already cover. Every removed assertion lives on somewhere; list where.
- [x] **Unit tests (light pass):** duplicates, tests of deleted code, tests that only restate a copied constant; before/after count.
- [x] **Release doc:** "Audit due" line: ran at 0.1.33, next due at 0.1.38.
- [x] **Proof:** quick green; the full UI suite green; a before/after table.

## Answer

18 -> 17 UI scenarios: "New feature on a workspace of each of two accounts" now runs at the start of the "Test boots the feature server" scenario (same two repos and accounts); its assertions (two Features rows, each session on its own account folder, the first prompt) all moved with it. JSON totals: 123.7 s before, **122.5 s** after (green, no rerun). Unit tests: nothing dead, no true duplicates; 2,011 (+2 skipped) before and after. Details: the 0.1.33 section of `.scratch/test-audit/inventory.md`.
