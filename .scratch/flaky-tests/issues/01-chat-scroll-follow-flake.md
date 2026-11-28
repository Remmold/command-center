# 01: The chat sometimes stops following new output to the bottom

**What to build:** the chat transcript reliably follows a new long answer to the bottom, so the "chat rendering" UI test never fails on it.

**Blocked by:** None (can start immediately)

**Status:** needs-triage

Seen on 2026-11-28:
- `e2e/chat.spec.ts:681` failed in 1 of 13 runs on main `c4815e9`, and the same on the model3d branch. The gap to the bottom read 1012.7 px where the test expects under 50.
- `e2e/chat.spec.ts:843` ("follows new output across a trip to Media") failed once in 13 runs on the branch, with a 296 px gap.

- [ ] Root cause of the missed follow found and fixed
- [ ] The "chat rendering" test passes 20 runs in a row (`--repeat-each=20`)
