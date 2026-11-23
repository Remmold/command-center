# 01: Trim the test suites to a budget

**What to build:** Andreas (2026-11-23): "I think we have too many tests. Gotta re-evaluate tests occasionally."

Measured on 0.1.7:
- unit tests: 852 in 93 files, about 5 s (cheap);
- UI suite: **42 scenarios** in one 1,342-line `e2e/smoke.spec.ts`, about 2.5–3 min per run, each scenario launching a full app. This is the real cost: agents run it every round, and releases ran it twice.

Decided: the UI suite gets **≤ 20 scenarios and ≤ 90 s**, unit tests get a light pass, a budget check is added, and the suites are re-audited every 5 releases.

**Blocked by:** None. Run it on main after release 0.1.7 is merged, so no other branch is changing `e2e/`.

**Status:** ready-for-agent

- [ ] **Inventory:** list every UI scenario with:
  - its runtime, from a JSON reporter run;
  - what it proves;
  - whether a unit test already covers the same rule;
  - whether it guards a bug that reached Andreas. Those must stay: the VS Code kill (`processTree`), the observed-view cut-off, scroll-follow under lazy rendering, the send-mid-turn queue and the update busy gate.

  Write it to `.scratch/test-audit/inventory.md`.
- [ ] **UI suite:** get to ≤ 20 scenarios and ≤ 90 s.
  - Merge scenarios that can share one app launch (one launch, several steps, clear `test.step` names).
  - Delete scenarios whose rule is covered by a unit test and that prove no app wiring of their own.
  - Delete scenarios of behaviour that has since been replaced, e.g. the media column, now a tab.
  - Every merged-away assertion must still exist somewhere: in the merged scenario or in a unit test. List where each went.
  - Split the 1,342-line file into a few files by area if that reads better. Keep `e2e/harness.ts` and `e2e/processTree.ts` behaviour exactly.
- [ ] **Unit tests (light pass):**
  - remove exact duplicates;
  - remove tests of deleted code;
  - remove tests that only restate a constant copied from source with no rule behind it.

  Keep the fake CLI's tests, since they guard the zero-token harness. Report the before and after count.
- [ ] **Budget check:** a quick-tier unit test, `e2e/budget.test.ts`, that counts UI scenarios in `e2e/*.spec.ts` and fails above 20 with a message pointing to the agent brief's rule. The 90 s limit is checked in the release gate instead, through the JSON reporter's total, since it can't run in quick.
- [ ] **Release gate:** at release, the UI suite runs once, and only failed tests rerun, through Playwright's `--last-failed`. Write the release steps, including "every 5th release: test audit", into `docs/agents/release.md`, and link it from `CLAUDE.md`'s Commands section in one line.
- [ ] **Proof:**
  - quick and the UI suite green, twice in a row;
  - the perf guard and zoom check green;
  - `.scratch/test-audit/inventory.md` ends with a before/after table: scenarios, UI runtime, unit test count, quick runtime.
