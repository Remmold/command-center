# 06: Tick findings and apply fixes

**What to build:** every finding on the map has a checkbox, and **Apply N fixes** sends the ticked ones to Claude, which edits the files and marks each one applied or skipped (spec: `.scratch/context-analysis/spec.md`).

Rules (from the spec, word for word):
- **Fixing.** Every finding, from the health check or the drift check, has a checkbox. **Apply N fixes** sends the ticked findings to the latest drift check's chat, which edits the files and marks each finding applied or skipped in the findings file. If no chat for that run is open, a new session starts and is sent the request. Nothing is edited before Andreas ticks.
- **Applying fixes.** "Apply N fixes" sends one message to the run's session: the findings file path and the ticked ids, asking it to apply those and mark each one. If the session no longer exists, a new session on the same workspace (same added folders) is started and sent that message. Health findings go to the latest run's session in the same way, or to a new session whose message lists the ticked health findings in full, because they are in no file.
- Applied and skipped findings show as such on the map (from the findings file); notes have no checkbox.
- **UI scenario (seam 6), part 2:** extend ticket 05's rewritten Context scenario: → tick → Apply → the fake CLI log shows the message carrying that finding id. Still one scenario, 13 of 20.

**Blocked by:** 05

**Status:** resolved

- [x] Unit test the fix-message builder: drift ids with the file path; health findings in full; mixed ticks.
- [x] Apply sends to the run's live session; with the session gone, a new session starts with the run's added folders and is sent the message (via ticket 05's `send`).
- [x] Applied and skipped statuses show on the map; notes have no checkbox.
- [x] The Context UI scenario covers tick → Apply → logged message; the count is still 13 of 20.
- [x] Quick tier green.
