# 07: Scheduled test audit at 0.1.38

**What to build:** the scheduled test audit (release.md step 5), run before releasing 0.1.38, which removes the main chat and the features the app made (ADR 0012).

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] **Inventory:** a "0.1.38" section in `.scratch/test-audit/inventory.md` with every scenario's runtime from a JSON run.
- [x] **Trim:** the two feature-cockpit scenarios went with the feature; no other merge.
- [x] **Unit tests (light pass):** tests of deleted code removed; sample data moved off retired prompt kinds; before/after count.
- [x] **Release doc:** "Audit due" line: ran at 0.1.38, next due at 0.1.43.
- [x] **Proof:** quick green; the full UI suite green in 165.1 s; a before/after table.

## Answer

19 -> 17 UI scenarios (both removed ones tested deleted code), 165.1 s of 200 s, green with no rerun. Unit tests 2,268 -> 1,819 (+2 skipped), 227 -> 183 files. Details: the 0.1.38 section of `.scratch/test-audit/inventory.md`.
