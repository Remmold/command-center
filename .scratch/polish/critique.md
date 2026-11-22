# Dashboard and Board critique (from the before shots)

Shots: `shots/before-*.png` (seeded by `e2e/shots/dashboard-board.shots.ts`: 4 fake repos, one worktree, every ticket status; sessions Running, Needs approval, Your turn, Idle). After: `shots/after-*.png`.

## Dashboard: what a glance should answer

- **What needs me:** Needs you answers it well (title · repo, status, wait). Kept as is.
- **What's running:** Live session cards bury the status on its own line between title and snippet, so each card reads as four stacked lines with the status in the middle. **Fixed:** status sits top right of the card beside the time.
- **What moved:** Now building packs eight items into one line (tag, name, bar, count, ticket, status, note, time); at 1100 px the note is cut to "02 resolved: re…" and the line reads as a wall. **Fixed:** two lines per feature (name and ticket in progress / bar and last note), status and time on the right.
- **Account usage:** clear; repeats the title-bar meter but adds the reset time. Kept.
- Large empty space below the sections at 1440×900 with few sessions. Left: filling it would mean new data.

## Board vs GitHub Projects

- **Card density:** every card has three rows of chips (repo icon, worktree tag, feature chip, dot / `#NN` title / status chip), so a Done card is as tall as a busy one. GitHub's card is a small `repo #N` line, the title, then labels only when there are any. **Fixed:** meta line reads `feature #NN` in muted text (no chip), title without the number, third row only when it says something.
- **Labels that repeat the column:** `in-progress` in In progress, `resolved` in Done, `blocked` in Blocked. **Fixed:** hidden there; triage words, `wontfix`, and words that differ from the column (e.g. `ready-for-agent` in Blocked) stay.
- **Status dots everywhere:** a dot on every card shows the workspace's session, not the ticket's, so 13 dots say the same 4 things. **Fixed:** only on In progress cards.
- **Column counts:** far right of the header, away from the title; GitHub puts the count beside the name. **Fixed:** beside the title, styled like the Dashboard's section counts.
- **Card detail on click:** the drawer repeats itself: header badges `In progress` + `in-progress`, a "Status line" section, then the ticket body again opens with its `# 03:` heading, `Blocked by:` and `Status:` lines; "Blocked by: Nothing." shows for unblocked tickets; "Seen in" repeats the column badge for a single copy. **Fixed:** header shows column (+ status word only when it adds information, + the status note); body drops the heading and the two field lines; empty Blocked by is hidden; Seen-in badge only with several copies; blockers read `#01 …` like cards.
- **Drawer width:** opened at half the board, squeezing four columns into 170 px with a horizontal scrollbar at 1440. **Fixed:** opens at 40 % (a share already saved is kept).
- **Empty states:** "No tickets yet…" / "No tickets match." exist; empty columns show just the header. Left (GitHub does the same).

## VS Code Dark Modern consistency

- Section headers: Dashboard panels use 11 px bold caps with the count beside; board columns used 10 px caps with the count far right. Board count now matches.
- Card meta lines did not span the card, so trailing items (time, dot) sat right after the text instead of at the edge. Fixed in the `CardMeta` primitive.
- Left: the drawer's ticket checklist renders a bullet plus a checkbox (Markdown task list); the "Finished features" toggle wraps onto its own line when the drawer is open at narrow widths.
