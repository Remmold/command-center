# 02: Feature rows show stage, ticket progress and account; completed fold away

**What to build:** each row in the Features group shows where the feature stands, read from its files, with tickets done out of total and the account it runs on. Spec: `.scratch/feature-cockpit/spec.md` (user stories 8–14, 62; "Feature stage reader").

**Blocked by:** 01

**Status:** resolved

- [x] A pure stage reader takes the file facts of the feature's `.scratch` folder in its worktree (spec present, ticket statuses, test steps file present, completed flag) and returns the stage plus tickets done out of total. Stages, word for word: no spec: Grilling; spec only: Spec; tickets none started: Tickets; any ticket in progress or done: Building; test steps written: Testing; completed: Completed. It reuses the board's ticket status reading.
- [x] The stage is never stored; it is re-read when a file in the feature changes and each row updates without a restart.
- [x] A row shows name, repo icon, stage, tickets done out of total, the feature session's status (Running, Needs approval, Your turn, Idle) and the account's name. The session still counts in the Needs you queue and the tray badge.
- [x] Clicking a row opens the feature session. Nothing in the app requires typing into it.
- [x] A Completed group, folded by default, lists completed features. Nothing completes a feature yet (ticket 08), so a test seeds a completed feature record.
- [x] A feature whose worktree folder is gone shows a plain "worktree missing" note instead of a stage and never breaks the list.
- [x] A feature session counts in the Needs you queue, the "jump to next waiting" key and the tray badge (ticket 01 hides feature sessions from the ordinary Work list, so these skipped them).
- [x] After an app restart a feature's session is hosted again when its row is clicked (or still running), and a row whose session cannot be found says so plainly instead of doing nothing on click.
- [x] Vitest: the stage reader for every stage above, the tickets count, an in-progress ticket, a missing folder.
- [x] No new UI suite scenario.
