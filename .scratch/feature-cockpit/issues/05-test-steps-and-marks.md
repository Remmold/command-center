# 05: Test steps with Pass/Fail marks and notes

**What to build:** a feature's test flow can be a short checklist of steps that Andreas marks Pass or Fail in a window, with a one-line note on a Fail saved where the feature session can read it. Spec: `.scratch/feature-cockpit/spec.md` (user stories 41–47; "Test steps file and marks").

**Blocked by:** 01

**Status:** resolved

- [x] A pure parser reads the checklist: one `- [ ]` line per step in a markdown file in the test-flows folder under the repo's subfolder, named after the feature. The feature record names it; the lookup does not read the session's transcript (spec, "Test flow lookup across accounts").
- [x] Marks live in a sibling results file keyed by a hash of each step's text: Pass, Fail and the Fail's note. A rewritten checklist keeps the mark of every step whose text is unchanged and drops the mark of a changed or removed one.
- [x] The test flow window shows a feature's checklist with Pass and Fail on each step, an optional one-line note on Fail, and a counter of pass, fail and waiting. It reloads when the checklist file changes, as today's Test tab does. A session with a command-style test flow behaves **exactly** as now.
- [x] The feature row and the stage reader show Testing once the checklist exists, and the row shows the last test result (all Pass, N failed, N waiting).
- [x] The results file is plain text the feature session can read, and its path is written into the checklist's header line so the session finds it.
- [x] Vitest: parse, hash key, marks kept when the text is unchanged and dropped when it changes, note stored, counter, results file round trip, a malformed line ignored with a reason.
- [x] No new UI suite scenario.
