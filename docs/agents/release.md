# Release steps

Only Andreas releases. These are the steps from a green `main` to a published installer.

**Audit due:** the last test audit ran at 0.1.23 (ticket `.scratch/test-audit/issues/04-audit-at-0.1.23.md`); the next is due at 0.1.28.

0. **Audit check:** before every release, the conductor reads the "Audit due" line above; when this release is the one due, run step 5 first.

1. **Quick tier:** `pnpm quick` is green. It includes `e2e/budget.test.ts`, which fails when `e2e/*.spec.ts` holds more than 20 UI scenarios.
2. **UI suite, once:** `pnpm e2e:gate`. It builds, runs the UI suite once, reruns only the failed tests with Playwright's `--last-failed`, and fails if a test is still red or the suite took more than 90 s by the JSON report's total. Never run the whole suite a second time. Run it with nothing else busy on the machine: under heavy load the same suite reads 30–40% slower and fails the 90 s budget.
3. **Version:** `pnpm version:bump`, then commit and push the version.
4. **Publish:** `pnpm release` builds the installer and publishes it as the GitHub Release for that version.
5. **Every 5th release: test audit.** The "Audit due" line above names the last audit and the next one; update it after each audit. When this release is the one due, re-audit both suites before step 1, as in `.scratch/test-audit/issues/01-trim-the-suites.md`: an inventory of every UI scenario with its runtime, merge or delete what a unit test or another scenario already covers, and a light pass over the unit tests for duplicates, tests of deleted code and copied constants. Keep the regression tests for bugs that reached Andreas.
