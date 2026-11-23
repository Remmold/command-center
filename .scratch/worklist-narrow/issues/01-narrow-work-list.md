# 01: The Work list reads well when narrow

**What to build:** Andreas's screenshot (0.1.7, list at about 300 px) is `C:\Users\remmold\AppData\Local\Temp\claude\c85b1d19935b6b03\94ac3789-dfed-4f49-9914-b5b495f3362a\scratchpad\parity-shots\worklist-narrow.png`; read it first. Three problems, and he approved all three fixes (2026-11-23):

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] **Account header badge:**
  - The bare blue number on an account header ("1") was unclear. It counts that account's chats needing him, and duplicates the "NEEDS YOU 1" group heading when the section is open.
  - Show it **only when the section is folded**, as an amber pill reading "**1 waiting**" ("2 waiting"…) in the Needs-you colour, with a tooltip like "2 chats in Work are waiting on you".
  - Open sections show no badge.
- [x] **Row titles:**
  - Session rows lose their titles ("Repo…", "New s…") because the model and effort text ("Opus 5.5 · Medium") take the room.
  - When the list is narrow (container query on the list, roughly under 360 px), hide the model and effort text on rows so the title gets the width. When wide, show it as today.
  - The status dot always stays. The row's tooltip keeps the full title plus model and effort.
- [x] **Usage line under an account:** "Week 95% · ahead by …" was cut off, and the pace verdict is the most important part.
  - When narrow, lay out each window on two short lines (e.g. "Week 95%" with the bar, then "ahead of pace by 38% · resets Mon 23:59"), or otherwise make sure the percentage and the verdict are never truncated.
  - The reset time may truncate last.
  - Keep the account colour accent.
- [x] **Tests:**
  - unit tests for any pure label or formatting change (badge text, which parts collapse);
  - no new UI scenario (the suite budget is ≤ 20). If a check needs the app, extend the existing two-account scenario minimally.
  - The zoom check gets a narrow-list case (list at 300 px, 110% and 150%): no truncated percentage or verdict, and no overflow.
  - The perf guard stays green.
