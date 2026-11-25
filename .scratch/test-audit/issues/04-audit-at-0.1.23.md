# 04: Scheduled test audit at 0.1.23

**What to build:** Andreas asked for a test audit ("run a test audit"), run on `main` at 0.1.23. Three unmerged branches each add one UI scenario: `feature/context-cleanup` (a second scenario in `context.spec.ts`, about 2.7 s), `feature/test-flow-pane` (a new `testFlow.spec.ts`, about 4.4 s) and `feature/background-processes` (a new `processes.spec.ts`). main has 15 scenarios at 97 s by a JSON run today (about 84 s by Playwright's own clock on a quieter machine); with all three merged it would be 18 and over the 90 s budget.

Target: main's UI suite at **≤ 75 s** by the JSON report's total on a quiet machine, so the merged 18 fit in 90 s.

**Blocked by:** None (can start immediately)

**Status:** in-progress

- [x] **Inventory:** add a "0.1.23" section to `.scratch/test-audit/inventory.md`: every scenario with today's runtime from a JSON reporter run, what it proves, its unit-test overlap, and whether it guards a bug that reached Andreas (those stay).
- [x] **Trim:** merge scenarios that can share one app launch; delete what unit tests or other scenarios already cover. Every removed assertion lives on somewhere; list where. Drop of coverage nothing else has goes to Andreas as a question.
- [x] **Merge-safety:** no edit to `e2e/context.spec.ts`, `e2e/budget.ts`, `e2e/budget.test.ts`; `chat.spec.ts`'s tablist line, `harness.ts`'s `media:` line and log `kind` line unchanged; no renames or reformatting.
- [x] **Unit tests (light pass):** duplicates, tests of deleted code, tests that only restate a copied constant; before/after count.
- [x] **Release doc:** "Audit due" line: ran at 0.1.23, next due at 0.1.28.
- [x] **Proof:** quick green; the full UI suite green twice in a row, each JSON total ≤ 75 s; a before/after table.

## Answer

15 → 9 UI scenarios by six merges into shared launches (accounts: the profile-folder scenario into the Work-chat one; app: zoom and auto-update; chat: tool approval into slow turns, subagents into chat rendering; sessions: history, the VS Code session and the take-over in one). No assertion removed, no scenario deleted, every regression guard unchanged; the Work-chat start hold went from 2.5 s to 1 s. JSON totals: 97.2 s before, **69.2 s and 74.9 s** after (green twice in a row). Unit tests: nothing to remove, 1,184 (+2 skipped) unchanged. Details and where each scenario went: the 0.1.23 section of `.scratch/test-audit/inventory.md`.
