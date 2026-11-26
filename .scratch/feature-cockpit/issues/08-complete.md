# 08: Complete a feature, end to end

**What to build:** Complete finishes a feature once its steps pass: it stops the servers, closes the windows, drops the browser store, marks the feature Completed, and moves its session under Completed. The worktree and branch stay. Spec: `.scratch/feature-cockpit/spec.md` (user stories 48–54, 60; "Complete"). ADR 0008.

**Blocked by:** 02, 04, 05, 06

**Status:** ready-for-agent

- [ ] A Complete button on a feature, enabled once every test step passes; with steps still open it asks a plain "steps still open" confirmation first and then proceeds.
- [ ] Complete stops the feature's servers, closes its pair, removes its browser partition, frees its ports and marks the feature Completed; its session then shows under Completed (ticket 02's group). It never touches the worktree or branch.
- [ ] A separate Remove worktree action on a completed feature asks first, and refuses while the branch has commits beyond its base that are not merged. Complete never calls it.
- [ ] A completed feature can be re-opened: it returns to its stage, gets ports again and can be tested again.
- [ ] Features of different accounts and of one project run, test and complete at the same time without touching each other.
- [ ] Complete removes the feature's entries from the server runner's tracked state and its terminals, so nothing of a completed feature is listed as running (ticket 04's review found these leak).
- [ ] Vitest: Complete's effects in order with fakes (servers, windows, partition, ports, mark), re-open, the refusal of Remove worktree on unmerged work.
- [ ] UI suite: one new scenario in `featureCockpit.spec.ts` on the fake CLI, a localhost fake server and two fake profiles: Test boots the server and the pair shows its page; marking every step Pass and pressing Complete stops the server and moves the feature under Completed. `pnpm e2e:count` after this ticket reads 17 of 20.
