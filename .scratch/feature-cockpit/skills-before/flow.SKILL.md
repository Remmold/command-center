---
name: flow
description: Conductor for Matt Pocock's main flow (grill → spec → tickets → build every ticket → ship gate → retro) in one command, stopping only where Andreas must decide. Use when Andreas types /flow <idea>, or says "run the whole flow", "take it from grilling to done", "flow this". Not for one-file fixes or bugs (use /diagnosing-bugs).
argument-hint: "<the idea or feature, optionally pointing at a design doc>"
---

# flow

Andreas starts this himself, so it is his consent to run each stage of the main flow in
turn: `grill-with-docs` → `to-spec` → `to-tickets` → `implement` per ticket → ship gate →
`retro`. Those stage skills can only be started by a typed slash command, so this skill
**reads each stage's SKILL.md and follows it** instead of calling it. The stages' rules
still apply in full. Where they clash with Andreas's global CLAUDE.md (publishing,
verification lanes, Dev/Ship mode, test flows, TL;DR box), **the global CLAUDE.md wins**.

## 0. Find the stage skills, check the setup

- Stage instructions live under
  `~/.claude/plugins/cache/mattpocock/mattpocock-skills/<newest version>/skills/engineering/<stage>/SKILL.md`.
  Glob for the newest version; read each stage's file **when that stage begins**, not all
  up front (it keeps context lean).
- `docs/agents/issue-tracker.md` must exist in the repo. If it doesn't, stop and tell
  Andreas to run `/setup-matt-pocock-skills` first (it asks him questions; that's his call),
  then `/flow` again. If the tracker is anything but local markdown, stop and confirm: this
  skill never creates issues, comments or PRs anywhere (hard rule from the global CLAUDE.md).
- Run `git status` first. If it says "must be run in a work tree", check
  `git config core.bare`: `true` in a normal checkout means something flipped it. Tell
  Andreas and get his go before `git config core.bare false`, since another session may be
  mid-operation. (11-25: it flipped at 09:54 and blocked every git command.)
- Name the branch you'll work on. Follow the repo's memory and CLAUDE.md on which branch
  and whether pushing is allowed. Default: a local feature branch, no push. Write the commit
  it starts from at the top of the feature's `progress.md`: that **base commit** is what every
  code review diffs against, because `origin/main` moves during a flow. (11-26: main moved
  mid-flow, and a ticket agent told to review since `origin/main` had to notice it alone.)
- When the main checkout is on another unmerged branch, don't switch it: another session may
  be working there. Create a worktree beside it instead,
  `git worktree add -b <branch> ../<repo>-<feature> main`, install its dependencies, and do
  the whole flow there, briefing every agent with the worktree path. (11-25: the checkout
  held `feature/context-cleanup`, which wasn't merged yet.)

## The four stops (and only these)

| Stop | When | What Andreas does |
| --- | --- | --- |
| **1. Grill** | the whole grilling stage | answers questions; he owns every decision |
| **2. Spec** | spec file written | reads it and says "ok" or corrects it; this includes the test seams `to-spec` asks about |
| **3. Tickets** | ticket files written | approves the order and sizing |
| **4. Done** | after the ship gate and retro | picks which retro suggestions to keep; tests the test-flow run |

Between stops, keep going without asking. Keep each stop to one short message ending with
the TL;DR box: what you need from him, and nothing else.

Extra stops happen only for: something stays red after 3 self-heal attempts (global rule:
root cause, what was tried, ask); a ticket turns out to need a decision nobody made; or
anything irreversible or outward-facing.

## 1. Grill (stop 1)

Follow `grill-with-docs`. Research facts yourself (code, numbers, costs) and bring a
recommended answer with each question, so Andreas only decides. When the feature adds stored
ids, message fields or carry bits, count the free headroom (e.g. attribute ids under the ceiling)
and check whether a new field must cross a native/generated boundary (e.g. the JNI proxy); a
shortage is a grill question, not a mid-ticket surprise (11-19: the id ceiling and Downpour's
native field). When more flows are queued behind this one, reserve the shared ids and bits
for all of them now, in the repo's registry, so a later flow's plan doesn't lose its bit to an
earlier one (11-19: the Plaguebringer took a message bit the Vanguard plan had counted on).
ADR numbers are shared ids too: before writing an ADR, list `docs/adr/` on `main` and on every
unmerged branch (`git ls-tree --name-only <branch> docs/adr/`) and take the next number free on
all of them (11-26: claude-settings and processes-terminal both wrote ADR 0006; found at the
ship gate).
When a proposed rule picks or matches things in Andreas's real data (which file, which
session, which rows), dry-run it against his real data before you recommend it, and bring
what it picked into the question (11-25: "any shell command naming a file counts" picked a
probe of a missing file in the conductor's own session; found only at ticket 01).
A dry run applies every limit the shipped rule will apply, not just the one under discussion,
so the numbers you quote are the ones the feature will show (11-25: a hand count of MEMORY.md
used only the 200-line limit and quoted "25 lines lost"; the 25 KB limit cuts first, at 43).
The same goes for a text rule over names or values (masking, matching, classifying): run it over
the real catalog or file and bring what it hits and misses (11-26: "name contains TOKEN" masked
`MAX_THINKING_TOKENS`; found in ticket 08's review).
Write `GLOSSARY.md` and ADRs
as the stage says. End the grilling when no open question would change the spec; say so and
move straight on.

## 2. Spec (stop 2)

Follow `to-spec`, saved per the tracker doc (local: `.scratch/<feature>/spec.md`). Before
showing it, read every ADR written during the grilling against the spec and fix whichever is
wrong; a spec detail can quietly break an ADR's "never" (11-25: ADR 0005 said the app never
writes the findings file, while the spec had the app write its skeleton; ticket 05 found it).
When a user story says something another writer adds must survive (Claude's rules, another
session's edits), the spec names the mechanism that keeps it, per kind of value: per-item
merge, re-read before write, or a conflict question (11-26: "keep the rules Claude added" was
broken by whole-list saves until ticket 07).
Show a 5–10 line summary plus the seams, and wait for stop 2.

## 3. Tickets (stop 3)

Follow `to-tickets` (local: one file per ticket in `.scratch/<feature>/issues/`, blocking
edges as text). Copy every number, threshold and rule from the spec into the ticket word for
word; a paraphrase forks the source of truth and the implementer has to guess which is meant.
Before showing them, walk the spec's user stories one by one and name the ticket criterion that
delivers each; a story with no criterion gets one added (11-26: spec story 9 wanted Stop on
terminals, no ticket listed it, and the registry shipped without a stop call). Show a table:
number, title, blocked by, rough size. Wait for stop 3.
Do not `/clear` or compact before this point (the flow's context hygiene). If context is
nearing ~150k tokens before tickets exist, compact at the nearest stage boundary.

## 4. Build every ticket (no stop)

Work the tickets **one at a time**, blockers first. For each, start a **fresh subagent**
(the equivalent of `/clear` + `/implement`). Never run two at once in one checkout:
in repos where tests take a lock (Unity batch mode, a shared dev DB, one server port),
parallel runs collide. Brief it with pointers, not copies:

> Implement ticket `<path>` on branch `<branch>`. Read and follow
> `<path to implement/SKILL.md>`; use the Skill tool for `tdd` and `code-review` as it says,
> reviewing since `<the base commit, or the previous ticket's last commit>`.
> The seams are agreed in `<spec path>`; don't ask about them. Repo rules: `CLAUDE.md`.
> Dev mode: build + `<the repo's dev-tier command>` per round, plus the tests for touched files. One test run at a
> time. Commit to the branch as soon as it is green, before starting the code review; review
> fixes go in a follow-up commit. Never push, never post anything anywhere. Never
> `git stash`, checkout or reset: other sessions share the working tree. If you need
> a decision that the spec and ticket don't settle, stop and report the question; don't guess.
> When the dev tier prints "deferred to ship" for a file you touched, also run (plain, no
> `--selftest`) every check that names that file. Rerun the dev tier after any edit, even a
> comment. After each round, overwrite `<ticket path minus .md>.progress.md` with 3 lines (done,
> next step, open reds) so a replacement agent can resume if you stop.
> If you are low on room after the commit, don't start the code review: set the status to
> `in-progress — built, review pending`, say so in the progress file, and report.
> A test this flow added that fails even once is a bug in this ticket: make it wait on its
> condition before you report, never "rerun if flaky".
> If you change something every screen or chat shows (a shared tab strip, layout, entry
> point, startup), run the repo's whole UI suite once before committing, not only your test.
> Ticket status: set `**Status:** in-progress` before your first edit, `**Status:** <closed word>`
> after your commit, or `**Status:** blocked — <why>` if you stop stuck. Only the words in the
> tracker doc's lifecycle table; a partial finish stays `in-progress — <note>`. Tick (`- [x]`)
> each acceptance criterion you met before you set the closed word. Commit the
> ticket file, its progress file and the feature's `progress.md` line too, unless the tracker
> doc says the tracker folder is never committed; nothing else of yours stays uncommitted when
> you report.
> Report back in ≤10 lines: done or blocked, commit hash, tests run and their result (a red
> check by name with its FAIL lines, never just a count), anything the next ticket should know.

(11-25: a ticket agent ran out of room waiting on its two code reviews and handed back green but
uncommitted work. The same day, a ticket that made the chat tab strip always visible ran only
its own UI test; the older chat test it broke surfaced two tickets later. 11-26: a ticket agent
set `resolved` but left every criterion unticked. The same day, a ticket agent ran out of room
mid-review and needed a replacement, and a settings-watch flake was waved through as "rerun".)

Counts and limits you quote in a spec or ticket (test scenarios, suite seconds, free ids) come
from the repo's own check, never from a hand-rolled grep: in command-center that is
`pnpm e2e:count` (`e2e/budget.ts`'s counter). (11-25: a hand grep counted 16 scenarios where the counter
saw 15, so the tickets said "17 of 20" and the last ticket agent flagged the gap as a blocker.)

Fill `<the repo's dev-tier command>` with the gate skill's whole dev tier, never one
feature check: in darkfall64 that is `python C:\darkfall64\dev\run_gate_checks.py`, which also
runs every check naming a touched file. (11-19: briefs naming only the talent check let 5
stale checks through to the ship gate. 11-21: the dev tier deferred a check that reads the hub
manager file, so its red surfaced only at the ship gate. A ticket agent that stopped on a usage
limit left no notes for its replacement.) When the flow works in worktrees, the darkfall64 dev
tier is `python C:\darkfall64\dev\worktree_gate.py --java ... --files ...` (a flag per worktree,
`--files` the branch's changed files), never the plain runner. (11-26: void-wraith's ticket agents
ran the plain runner, it checked the main checkout, and gate 86 missed nine adds with no inventory.)

Before the first ticket, and again after any upstream merge or sync lands mid-flow, re-check
the spec's code facts (free ids, bit ranges, method and line names) against the current code
and correct the spec and tickets first. (11-19: a merge took the spec's next free attribute id
before ticket 04 used it.)

After each one: check its report, check that the commit exists and the quick tier is green,
check the ticket's status line reads the closed word (fix it if the agent wrote anything else), and
append one line to `.scratch/<feature>/progress.md` in the form `- NN <closed word>: <what> — <commit>`.
The **closed word** is the tracker doc's lifecycle word for finished-and-committed (`done` in
darkfall64); fill it into the brief. (11-26: the brief's `resolved` clashed with darkfall64's
lifecycle, which bans that word, and darkfall64 never commits `.scratch`.)
If the repo's tracker doc has no "Ticket lifecycle" section, add the one from
`C:\projects\personal\command-center\docs\agents\issue-tracker.md` before the first ticket and
say so at stop 3. (11-21: with no lifecycle defined, repos drifted to `done`, `talking` and
free-text statuses, and no ticket ever showed as in progress on the board.) Then start the next. Read logs and test output yourself.
Never ask Andreas for them.

**Your own commits (the conductor's):** never commit while a ticket agent is running; wait for
its report. Commit only the files you name, with `git commit -- <paths>`, never a bare
`git commit` after `git add`: the index may hold a ticket agent's staged files. (11-21: a
conductor commit swept up an agent's staged deletion, and that commit doesn't build on its own.)

**Empty real-data checks are findings.** When a ticket's report says a real-data check found
nothing (no rows, an empty list, "the board is empty for his workspaces"), stop and find out
why before the next ticket: is the feature reading the wrong place, or is Andreas's data
somewhere the spec didn't look? Settle it from the code and disk yourself; ask him only if it
is his call. (11-21: ticket 03 reported his 4 workspaces had no tickets; it was let through, and
Andreas found the empty board himself after 10 more tickets. His tickets lived in repos he
hadn't added.)

If a subagent reports blocked: settle it yourself from the spec, glossary and ADRs when the
answer is there. Only when it truly needs his call does it become an extra stop (batch all
open questions into one).

## 5. Ship gate (no stop unless red)

Ship mode from the global CLAUDE.md: the full suite, the repo's gate skill or soak and
self-play checks if it has them, and every shipped invariant pinned as a check. Self-heal up
to 3 times per failure. Then push only if the repo's memory/CLAUDE.md allows it.

When a check's own self-test is red, tell the gate agent to compare the anchor against the
last commit: a planted fault whose anchor was already gone there is stale and not this flow's
(report it, don't fix it here); one this flow's edits broke is re-anchored, never weakened.

## 6. Retro and hand-over (stop 4)

- Follow `retro` over this session (it's still in context, or point it at the progress file).
  List its suggestions; apply none until Andreas picks.
- Anything that needs eyes on a running app goes to the `test-flow` skill (Lane 2), after
  the gate is green.
- Final message: before/after table of what the feature changed, gate tier run and result,
  the commits, then the TL;DR box (keep which retro items, run which test-flow steps).
