# Feature cockpit: one main chat, one session per feature, a browser to test it in

Status: ready-for-agent

## Problem Statement

Andreas builds several features at once, often in the same project. Today each feature is an ordinary session among dozens in the Work list. Nothing says which session belongs to which feature, how far each one is, or which one is waiting for testing. To test a web feature he boots the servers by hand, picks ports that may clash with another project, opens a browser tab, and reads a test flow full of commands in a separate window. Testing two features of one project at once is close to impossible, because they share one checkout and one set of ports. When testing is done there is no moment that says the feature is finished: the session just gets closed.

## Solution

A feature becomes a first-class thing in the app.

- **New feature** asks for a workspace and a description, makes a **feature worktree**, starts the **feature session** and sends it `/flow` with the description. The flow grills, specs and ticks off tickets as today.
- The **main chat** is one permanent session pinned at the top of Work. It answers general questions about every feature, from a **feature digest** the app keeps current. It cannot act.
- Each feature shows in a **Features** group in the Work list with its **stage**, ticket progress, session status and test result. Clicking it opens the feature session; typing there is optional.
- When the feature has something to test, **Test** boots the feature's servers on free **feature ports**, and opens a **test pair**: the test flow in one window and a **preview browser** on the right page in another. One hotkey flips between them. A workspace without a **preview config** gets only the test flow.
- The test flow for such a feature is a short checklist of **test steps**, each marked Pass or Fail. A Fail is saved with a note and the feature session sees it.
- When every step passes, **Complete** stops the servers, closes the windows, marks the feature Completed and moves its session under Completed. The worktree and branch stay.

## User Stories

### Starting a feature

1. As Andreas, I want a New feature button that asks for a workspace and a description, so that every feature starts the same way.
2. As Andreas, I want the feature to get its own worktree and branch, so that I can test two features of one project side by side.
3. As Andreas, I want the feature session to start already running `/flow` with my description, so that I don't retype it.
4. As Andreas, I want the worktree's dependencies installed before the flow builds, using the workspace's install command when it has one, so that the feature can run.
5. As Andreas, I want New feature to tell me plainly when the workspace is not a git repository, so that I know why no worktree was made.
6. As Andreas, I want the feature's name to be a short slug the app proposes from the description and I can edit, so that folders and branches are readable.
7. As Andreas, I want a feature name that is already taken refused with a reason, so that two features never share a folder.

### Features in Work

8. As Andreas, I want a Features group at the top of the Work list, so that my features are not buried among ordinary sessions.
9. As Andreas, I want each feature row to show its name, workspace icon, stage and tickets done out of total, so that I see progress without opening it.
10. As Andreas, I want each row to show the feature session's status (Running, Needs approval, Your turn, Idle), so that the Needs you queue and tray badge still count it.
11. As Andreas, I want the stage read from the feature's files (no spec: Grilling; spec only: Spec; tickets none started: Tickets; any ticket in progress or done: Building; test steps written: Testing; completed: Completed), so that nobody has to update it by hand.
12. As Andreas, I want clicking a feature to open its session, so that I can type extra information into it when I choose to.
13. As Andreas, I want to never have to type into a feature session, so that the flow can run on its own between my stops.
14. As Andreas, I want completed features folded under a Completed group, so that the list stays short.
15. As Andreas, I want sessions that were not made through New feature to stay exactly as they are, so that nothing existing is disturbed.

### Main chat

16. As Andreas, I want one main chat pinned at the top of Work, always there, so that I have one place for general questions.
17. As Andreas, I want it to answer from a feature digest listing every feature with stage, tickets done out of total, session status, last test result and server state, so that its answers match what the app shows.
18. As Andreas, I want the digest rewritten whenever a feature's stage, tickets, status, test result or servers change, so that the main chat is never stale.
19. As Andreas, I want the main chat to be able to read a feature's spec, tickets and progress notes when I ask for detail, so that "what is left on the login feature" has a real answer.
20. As Andreas, I want the main chat to be unable to start, stop or complete anything, so that a chat slip changes nothing.
21. As Andreas, I want the main chat to survive restarts and keep its history, so that it behaves like one continuous conversation.

### Testing a feature

22. As Andreas, I want a Test button on a feature that has test steps, so that testing is one click.
23. As Andreas, I want Test to boot the feature's servers from its workspace's preview config, in the feature worktree, and wait until each is ready, so that the browser never opens on a dead page.
24. As Andreas, I want each server to get a free port the app reserves, passed to it as PORT and wherever the command says `{port}`, so that no two features or projects clash.
25. As Andreas, I want a port some other program already holds never reserved, so that a boot never fails on a clash.
26. As Andreas, I want ports kept stable for a feature while it lives, so that bookmarks and the browser's page stay valid after a restart of its servers.
27. As Andreas, I want a server that fails to start or become ready in 60 seconds to show its output and a Retry, so that I can see why.
28. As Andreas, I want the preview browser to open on the page the preview config names as the start page, so that I land where the testing happens.
29. As Andreas, I want the preview browser to load only that feature's own local servers, so that the app stays offline except for Claude.
30. As Andreas, I want a link to any other address opened in my normal browser, so that nothing external loads inside the preview browser.
31. As Andreas, I want each feature's preview browser to keep its own cookies and storage, so that two features' logins never overwrite each other (localhost cookies ignore ports).
32. As Andreas, I want the test flow window and the preview browser to open together as one test pair, titled with the feature's name, so that I know which feature each belongs to.
33. As Andreas, I want one hotkey to flip between the two windows of the pair I am in, so that switching is instant.
34. As Andreas, I want to have several features' pairs open at once, even of one project, so that I can test several things at the same time.
35. As Andreas, I want pressing Test on a feature whose pair is open to bring it to the front, so that I never get two.
36. As Andreas, I want the pair to reopen where I last put each window, so that I place them once.
37. As Andreas, I want a workspace with no preview config to open only the test flow, so that games and native apps still work.
38. As Andreas, I want a Set up preview action on such a workspace that has Claude draft a preview config from the project, so that I only confirm it.
39. As Andreas, I want to edit a workspace's preview config in Settings (install command, servers with ready checks, start page), so that I can fix a draft.
40. As Andreas, I want a preview config with several servers (a front end and an API), each with its own port, so that a full-stack project boots completely.

### Test steps

41. As Andreas, I want the feature's test flow to be a short checklist of steps (where to go, what to do, what I should see), so that testing is quick.
42. As Andreas, I want no commands in such a checklist, since the servers boot themselves, so that I only click.
43. As Andreas, I want each step marked Pass or Fail with one click, so that I don't write a report.
44. As Andreas, I want a Fail to ask for an optional one-line note and save it where the feature session can read it, so that Claude knows what to fix.
45. As Andreas, I want my marks kept when the checklist is rewritten, for every step whose text is unchanged, so that a fix doesn't wipe my passes.
46. As Andreas, I want the window to show how many steps pass, fail and wait, so that I see where I am.
47. As Andreas, I want the feature row and the digest to show the last test result, so that the main chat can tell me which features failed testing.

### Completing

48. As Andreas, I want a Complete button on a feature, so that finishing has a name.
49. As Andreas, I want Complete enabled once every test step passes, and offered with a plain "steps still open" confirmation otherwise, so that I can finish early on purpose.
50. As Andreas, I want Complete to stop the feature's servers, close its windows and drop its browser store, so that nothing of it keeps running.
51. As Andreas, I want Complete to mark the feature Completed and move its session under Completed, so that the list shows what is done.
52. As Andreas, I want the worktree and branch to be kept, so that I can merge them and lose no work.
53. As Andreas, I want removing the worktree to be a separate action that asks first and refuses while the branch has unmerged work, so that Complete never deletes anything.
54. As Andreas, I want a completed feature to be re-openable, so that a missed bug is not a dead end.

### Flow and skills

55. As Andreas, I want `/flow` to write the feature's test steps in the new checklist when the workspace has a preview config, and in today's format when it has none, so that each project gets the fitting kind.
56. As Andreas, I want `/flow`, when started by New feature, to work in the feature worktree it is given and not make its own, so that the feature session and the windows agree on one folder.
57. As Andreas, I want all of this to cost no tokens beyond the sessions I already run, so that the cockpit itself is free.

## Implementation Decisions

- **Feature record.** The app keeps one record per feature: name, workspace, worktree path, branch, session id, ports, started and completed times. It is the single link between the session, the `.scratch/<feature>` folder in the worktree, the servers and the windows. A feature's stage is never stored: it is derived from the files (see story 11) each time it is shown.
- **Feature stage reader (pure).** Takes the file facts of a feature's `.scratch` folder (spec present, ticket statuses, test steps present and their marks, completed flag) and returns the stage plus tickets done out of total. Reuses the board's ticket status reading.
- **Feature digest writer.** Renders every feature record plus its stage, tickets, session status, last test result and server state into one markdown file in the app's data folder, rewritten on any change. Its path is given to the main chat in its first prompt, with the instruction that it answers only and may read the named features' files. The main chat runs with a tool allow-list of read tools only, so "answers only" holds by construction (ADR 0008).
- **Main chat.** A hosted session in a fixed app-owned folder, pinned above the Work list, resumed after a restart. It uses the default account profile.
- **Preview config.** Stored per workspace: optional install command; a list of servers (name, command, working folder inside the worktree, ready check, a port placeholder); start page path. The command template substitutes `{port}`; the server also receives PORT. A ready check is "the port accepts a connection". A workspace without one has no preview.
- **Port allocator (pure core).** Picks from a reserved range (4100–4999), skipping ports in the app's own records and ports that accept a connection or fail to bind right now. A feature keeps its ports until Complete.
- **Server runner.** Starts each server in the worktree as a terminal the app already knows (so output and Stop show in the Processes view), waits for the ready check with a 60 second limit, and reports Starting, Ready, Failed per server.
- **Preview browser.** One window per feature, with its own persistent storage partition named after the feature, removed on Complete. It allows navigation only to localhost on the feature's ports; every other link opens in the default browser. It is a window of the app, not a tab (ADR 0008's isolation needs a partition per window).
- **Test pair.** The test flow window renders the feature's checklist with Pass/Fail controls and a note for Fails; the preview browser sits beside it. A window-level hotkey flips focus within a pair. Window positions are remembered per feature and role. This extends today's Test tab and pop-out rather than replacing them: a session with a command-style test flow behaves exactly as now.
- **Test steps file and marks.** The checklist is a markdown file in the test-flows folder under the repo's subfolder, one `- [ ]` line per step, written by `/flow`. Marks are kept in a sibling results file keyed by a hash of each step's text, so an unchanged step keeps its mark when the checklist is rewritten, and a Fail's note is stored with it. The feature session reads the results file.
- **New feature.** Creates the worktree and branch from the workspace's main branch, runs the install command if any, adds the worktree as a workspace of the repo's group, starts the feature session there with `/flow <description>` plus the feature name and the worktree path, and records the feature. A failure at any step leaves nothing half-made: the worktree it just created is removed and the dialog says why.
- **Complete.** Stops the servers, closes the pair, removes the browser partition, frees the ports, marks the feature Completed, moves the session. It never touches the worktree or branch. A separate Remove worktree action runs `git worktree remove` only when the branch is merged or has no commits beyond its base.
- **Digest of server state** is read from the same records the Processes view uses.
- **Global skills.** `/flow` and `/test-flow` (outside this repo) are changed in the last ticket: `/flow` accepts a given worktree and feature name, and the test-flow skill writes the checklist form when the workspace has a preview config. Their diffs are shown at the ship gate.
- **Free headroom.** No new message bits or ids are involved. The app's e2e budget stands at 15 of 20 scenarios (`pnpm e2e:count`).

## Testing Decisions

- A good test checks behaviour a user sees (the stage shown, the port handed out, the mark kept), never how a module is built.
- **Seam 1, pure modules under Vitest (the main seam):** feature stage reader; port allocator; command template and preview config reading; digest writer; test steps parser and results merge (mark kept when the text is unchanged, dropped when it changes); the preview browser's navigation rule (allowed or sent out); worktree name and slug rules. Prior art: the board's ticket tests, the test-flow finder's tests.
- **Seam 2, one end-to-end path on the fake CLI (Playwright, budget +2 scenarios, 15 → 17 of 20):** New feature creates a feature that appears in the Features group with its stage; Test with a tiny local fake server boots it, opens the pair and shows its page; marking all steps Pass and pressing Complete stops the server and moves the feature under Completed. The window may not reach the internet, so the fake server is on localhost.
- Real Claude is never used in tests; the fake CLI stands in for the feature session and the main chat. Git worktree creation runs against a temp repo.
- The main chat's read-only allow-list is checked by a unit test on the arguments the app builds for its process.

## Out of Scope

- The main chat acting (opening, testing or completing a feature).
- Attaching existing sessions or `.scratch` folders to a feature.
- Browser tabs inside the main window, any browsing of non-local sites, browser devtools, and recording of browser steps.
- Automatic test runs by Claude driving the preview browser.
- Removing worktrees automatically, merging, and pushing.
- Preview support for projects with no web server; they keep the test flow window only.
- Opening features on a second computer.

## Further Notes

- Starting point for the vocabulary: Feature session, New feature, Feature worktree, Main chat, Feature digest, Feature stage, Preview config, Feature port, Preview browser, Test pair, Test step and Complete are in `GLOSSARY.md`.
- ADR 0008 records why a feature owns its worktree, ports and browser store, and why the main chat reads a digest instead of calling a tool.
- "Feature" already names a `.scratch/<feature>` folder in the Board's glossary entry; a feature made here is that same folder plus its record, session, worktree and servers.
- The main chat's folder, the digest's place and the reserved port range are app-owned and need no setting.
