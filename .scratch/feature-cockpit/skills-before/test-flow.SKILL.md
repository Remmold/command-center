---
name: test-flow
description: "Create or update the manual test-flow documents, one per feature at C:\\projects\\test-flows\\<repo>\\<feature>.md, and regenerate its click-to-copy HTML twin. Use whenever work produces anything Andreas must verify by hand - in-game steps, UI to click, visuals or audio to judge, servers to restart, builds to confirm - or when he reports results from a run and the document needs rewriting for what lands next. Trigger: /test-flow."
---

# test-flow

The manual half of the two verification lanes. Lane 1 (automated checks) proves
everything a script can; whatever is left needs Andreas's eyes, ears and judgement,
and that goes here.

**Never put an item in this document that a script could assert.** If it can be
checked without the application running, it belongs in Lane 1 instead.

**Never ask Andreas to paste a log, a stack trace, or the output of a command.**
Logs and crash dumps are readable directly — a step that says "run this findstr and
send me the result" is the agent making Andreas fetch its own evidence, and it costs
a round trip every time. He reports what he SAW in the game; reading the logs to
find out why is the agent's job, done as soon as he reports back. A test-flow step
must always be an observation ("the marker sits outside the body"), never a
retrieval.

## Before writing anything: the Green Gate

Run the build and the automated checks for the current mode first, and confirm they
pass. Only then write or update the document. State in the response which tier ran.

- **Dev mode (default, every iteration round):** the build plus the repo's quick tier -
  in `c:\darkfall64` that is `python C:\darkfall64\dev\run_gate_checks.py` (boot-fatal
  checks + the checks for the files touched, about a minute). Not the full gate.
- **Ship mode (MR, merge, push, release, or Andreas says "ship"):** everything - in
  `c:\darkfall64`, `--tier ship`.

If the repo has a gate skill of its own (e.g. `darkfall-gate` in `c:\darkfall64`),
use its tier for the mode instead of assembling the commands by hand.

## The document

**ONE DOCUMENT PER FEATURE (Andreas, 2026-11-25).** Path:
`C:\projects\test-flows\<repo-name>\<feature>.md` (e.g. `darkfall64\tablet-merchant.md`),
a short kebab-case feature name. Never put two features in one file and never go back to one
shared `<repo-name>.md`. When a feature passes, delete its `.md` and `.html`. A fix that
re-tests a feature rewrites that feature's file, not a new one.

The folder holds ONLY these feature documents, the matching `<repo-name>-commands.md`, and
their generated `.html` views. Nothing else goes in it.

### Required structure, in this order

1. **Current test run** — `# TEST RUN YYYY-MM-DD-X: <summary of what changed>`
   - The letter advances sequentially each time the document is rewritten (…BQ, BR, BS).
   - **Name the branch it belongs to, in the run heading.**
   - Numbered steps, each with `- [ ]` checkboxes stating the exact observable result.
   - Lead with a short account of what changed and *why*, including root causes of
     anything being re-tested. Andreas reads this to know what he is looking for.

**No appendix, no cheat sheet.** The document is the current run and nothing else. A repo's
standing commands belong in a separate `C:\projects\test-flows\<repo-name>-commands.md`,
rendered to HTML the same way. Commands a specific run needs are written **inline in that
run**, so Andreas never has to look somewhere else mid-test.

**CURRENT TESTS ONLY — NO HISTORY.** There is no ARCHIVE section and no UP NEXT section.
When a run passes, **delete it**. Never leave an older run below the current one, and never
promote a stale run from another branch to "current" just to fill the slot.

Andreas reads this file as a worklist: anything still in it reads as *"you must test this"*.
Leaving passed or off-branch runs in place has already cost him a session testing another
branch's work. If the current branch has nothing to verify, say exactly that at the top.

### One command per fenced block

Every command gets its own dedicated, single-line fenced block:

````
```
/set_mastery dead 50
```
````

Never stack two commands in one block. Andreas copies blocks whole, one at a time,
and must never have to edit or split what he copied. Include every required prefix
(the leading `/` on in-game commands, etc.).

## Regenerate the HTML twin — REQUIRED

After EVERY rewrite of the `.md`, from `C:\projects\test-flows\`:

```
python C:\projects\tools\render_test_flow.py <repo-name>\<feature>.md
```

The HTML renders each command as a full-width click-to-copy row. **Andreas tests
from the `.html` in a browser, not from the raw `.md`.** A rewrite without a
regenerated twin is incomplete — treat the render as part of writing the document,
not an optional follow-up.

## Lifecycle

- Andreas runs the current run top to bottom and reports failures **by step number**.
- On receiving a report: **delete** verified items, carry unconfirmed or failed steps
  into the next lettered run, and rewrite so the current run reflects exactly what needs
  testing **now** — nothing stale, nothing already passed, no archive of what passed.
- Rewrite **in place**. Same filename forever; only the run letter advances.
- **Other sessions write the same document.** Re-read it immediately before writing,
  change it in one read-modify-write (never patch it from a copy read earlier), number a new
  section after the last one now in the file, and re-read the result to confirm your section
  and the run heading both landed. (11-25: two sessions both added a "section 39", and one
  write wiped the other's run-heading edit.)
- **Do not rebuild or redeploy while Andreas is mid-run.** Batch fixes and publish
  them as the next lettered run.
- When a Lane 1 check starts covering something, delete it from the manual run and
  say so — the manual document should shrink as automation grows.

## Writing the steps

- Order steps so the highest-risk, most-informative check comes early; say plainly
  which step is the headline.
- Where a result is a judgement call ("does this look right"), ask for the decision
  explicitly and give the options.
- Where a number would settle a tuning question, ask for the number.
- Note up front what needs restarting (cluster, particular nodes, client) and what
  does not.
- Finish the response with the `TL;DR — your turn` block.
