# claude-settings retro notes (raw, for the retro stage)

- Ticket 05's agent ran out of room before its code review finished; a replacement agent finished it. Same failure as 11-25 despite "commit before review".
- Review findings repeatedly became carry-over fixes in the next ticket's brief (05→06, 06→07, 07→08, 08→09). Worked, but each brief grew a "first fix" section.
- User story 48 (keep Claude's added rules) was broken by whole-list patching until ticket 07; the spec named the rule but not the list-item patch it needs.
- main moved mid-flow (processes-terminal, ui-polish, 0.1.30) and took ADR number 0006; caught only at the ship gate, renamed to 0007. Parallel flows should reserve ADR numbers like ids.
- The spec's masking rule ("contains KEY/TOKEN") hid MAX_THINKING_TOKENS; a dry run on the real catalog would have caught it at the grill.
- A test flaked under full-suite load (fixed 400 ms wait); the brief's "rerun if flaky" hid it once before it was fixed.
- Bash heredocs failed / mangled backslashes on this machine; Write/Edit used instead.
- Scope creep accepted: raw JSON boxes on ~20 complex catalog rows (ticket 05), env variables Claude ignores marked (ticket 08).
- Ticket 02 judgement calls accepted by the conductor: organisation values lock rows except combined lists/objects; Account layer badges use the chosen or first workspace on that account.
- Chords in the key capture now need Enter or a click between keys (gate fix for a keyboard way out).
