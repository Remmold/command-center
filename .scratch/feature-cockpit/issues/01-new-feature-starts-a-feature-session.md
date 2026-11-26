# 01: New feature makes a worktree and starts a feature session on the right account

**What to build:** a New feature button that asks for a workspace and a description, makes the feature's worktree and branch, adds the worktree as a workspace of the same repo group on the **same account**, starts the feature session in it with `/flow` and the description, and shows the feature as a row under a Features group in the Work list. This is the tracer bullet every later ticket builds on. Spec: `.scratch/feature-cockpit/spec.md` (user stories 1–7, 13, 15, 56–59, 65, 66; "Feature record", "New feature", "Accounts", "Account readiness"). ADR 0008, ADR 0001.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] A feature record store in the main process: name, workspace, worktree path, branch, session id, ports (empty for now), started and completed times. It stores the workspace, never its own account (spec, "Accounts").
- [x] The dialog asks for a workspace and a description. It proposes a short slug from the description that Andreas can edit. A name already taken by another feature, or one that is not a valid folder and branch name, is refused with the reason.
- [x] A workspace that is not a git repository is refused in the dialog with a plain reason; nothing is made.
- [x] New feature creates the worktree and branch from the workspace's main branch, runs the workspace's install command when it has one (none exists until ticket 03: skip), adds the worktree as a workspace of the repo's group **with the source workspace's account profile**, starts the feature session there, and records the feature.
- [x] The feature session starts with `/flow <description>` plus the feature name and the worktree path in its first prompt, without waiting for anything typed. Andreas never has to type into it (story 13).
- [x] A failure at any step removes the worktree this call just made and the dialog says why; no record, workspace or session is left behind.
- [x] A profile whose Claude folder does not offer `/flow` (for example an adopted folder, which gets no shared-item links) is refused in the dialog with the reason. Confirm in the code whether the profile linker shares the `skills` folder into app-made profiles, and state the finding in the progress file.
- [x] A Features group at the top of the Work list lists each feature as a row with its name, repo icon and the feature session's status; clicking opens the feature session. Sessions not made through New feature, and their groups, are **identical** to before.
- [x] A feature whose account profile was renamed shows the new name; one whose profile was removed shows a plain "account removed" note and still opens, and never breaks the list.
- [x] Vitest: slug and name rules (taken, invalid, proposed); the worktree workspace carries the source workspace's profile; the environment built for the feature session names that profile's config folder; a profile without `/flow` is refused; a failed step cleans up; temp git repo for the worktree.
- [x] UI suite: one new scenario in a new `featureCockpit.spec.ts` on the fake CLI with two account profiles (default and a second): New feature on a workspace of each creates two rows, and each feature session was started with its own account's config folder variable. `pnpm e2e:count` after this ticket reads 16 of 20.
