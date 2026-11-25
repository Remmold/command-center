# Context analysis: context map, guided tour, health check and drift check

Status: ready-for-agent

## Problem Statement

The Context view lists what Claude uses in a workspace, but it doesn't explain it. Andreas sees rows of files with token counts. He doesn't see how they fit together: what loads at every start and what loads only on demand, which layer overrides which, how MEMORY.md points at memory files, or where a bloated start total comes from. Real problems stay invisible. In continuum, MEMORY.md is 225 lines, but Claude only loads the first 200, so its last 25 index lines never reach a chat. In darkfall64, 137 of 396 memory files aren't linked from MEMORY.md, so Claude never finds them.

Today's Clean up starts a chat whose results are a table at the end of a transcript. There is nothing to follow while it runs, nothing that stays visible afterwards, and nothing to tick. Andreas wants this kind of guided analysis for more areas later (board cleanup, general cleanup). Context comes first, but the result format should not be tied to it.

## Solution

The Context view gets a **Files | Map** switch above its middle and right panes. Files is today's view, unchanged. Map shows the selected workspace's **context map** with the **guided tour** beside it.

**Context map.** The three context layers (Account, Repo, Local) are lanes, side by side in the order they apply. Each lane is split into three bands: **Every start** (CLAUDE.md files and their imports, MEMORY.md, and skill and agent names and descriptions), **On demand** (memory files, subfolder CLAUDE.md files, skill and agent bodies, commands) and **Behaviour** (settings, hooks, MCP servers, plugins: they shape what Claude may do and don't count toward tokens). Each item is a block sized by its tokens. Lines show imports, and MEMORY.md's links to memory files. A large group (more than 8 items) is one block ("176 memory files") that expands on click. Clicking a block shows a short plain-words explanation of what that kind is and how Claude loads it, the block's numbers, and its findings, with an **Open in Files** button. Findings show on their blocks as coloured dots and counts.

**Guided tour.** A column of six steps: 1 What every chat starts with · 2 Memory · 3 Skills, agents & commands · 4 Settings, hooks & MCP · 5 Health check · 6 Drift check. Each step highlights its part of the map and explains it with this workspace's real numbers ("Every chat here starts with ~4.2k tokens: 2.1k from your account CLAUDE.md, …"). Back and Next move between steps, and clicking the map works at any time.

**Health check (free, instant).** Runs whenever the map is drawn, with no tokens. It finds:
- MEMORY.md past what Claude loads (more than 200 lines or more than 25 KB), naming the lines that get cut off.
- Memory files that MEMORY.md never links to.
- MEMORY.md index lines that point at a missing file.
- CLAUDE.md files over 40,000 characters (Claude Code's own size warning).

`[[name]]` links that match no memory are listed as notes, not problems: the memory rules allow them as markers for later.

**Drift check (Claude, costs tokens).** Step 6 replaces today's Clean up menu, keeping the same three kinds (This project, Account, Across projects…) and covering the same files. It shows a cost note and the model and effort pickers. **Start** creates a hosted session on the workspace's account and sends the prompt itself, and Andreas stays in Context. The session writes its progress and findings to a findings file in the app's data folder (ADR 0005). The map watches that file and fills in as the run goes: the run's steps tick off, and findings appear on their blocks. "Open chat" jumps to the session in Work.

**Fixing.** Every finding, from the health check or the drift check, has a checkbox. **Apply N fixes** sends the ticked findings to the latest drift check's chat, which edits the files and marks each finding applied or skipped in the findings file. If no chat for that run is open, a new session starts and is sent the request. Nothing is edited before Andreas ticks.

**Staleness.** The map shows the latest drift check that covers this workspace, with its date ("checked 3 days ago"). A finding whose file changed after the run started is dimmed with "file changed since".

## User Stories

1. As Andreas, I want a Files | Map switch in the Context view, so that the map lives next to the files it explains.
2. As Andreas, I want Files to stay exactly as today, so that editing context doesn't change.
3. As Andreas, I want the Map to follow the selected workspace in the workspace list, so that I pick a project the way I already do.
4. As Andreas, I want the layers drawn as lanes in the order they apply, so that I see what overrides what.
5. As Andreas, I want each lane split into Every start, On demand and Behaviour, so that I see what costs tokens in every chat and what doesn't.
6. As Andreas, I want each block sized by its tokens, so that the expensive parts stand out.
7. As Andreas, I want lines from a CLAUDE.md to the files it imports, so that hidden context is visible.
8. As Andreas, I want lines from MEMORY.md to the memory files it links, so that I see how memory is found.
9. As Andreas, I want unlinked memory files drawn apart from the linked ones, so that I see at a glance what Claude never finds.
10. As Andreas, I want groups of more than 8 items drawn as one block that expands on click, so that 396 memory files don't drown the map.
11. As Andreas, I want clicking a block to explain in plain words what it is and how Claude loads it, so that the map teaches me the structure.
12. As Andreas, I want a block's explanation to show its numbers (tokens, count, lines) and its findings, so that I understand it in one place.
13. As Andreas, I want "Open in Files" on a block, so that I can jump to the file and edit it.
14. As Andreas, I want items shared with Personal and read-only items marked on the map as in Files, so that I know an edit's reach.
15. As Andreas, I want a guided tour of six steps beside the map, so that I can walk through the context in order.
16. As Andreas, I want each tour step to highlight its part of the map, so that the words and the picture match.
17. As Andreas, I want each tour step's text to use this workspace's real numbers, so that it's about my project and not generic.
18. As Andreas, I want Back and Next on the tour and free clicking on the map, so that I can follow the tour or explore.
19. As Andreas, I want the health check to run on its own whenever the map is drawn, so that free problems are always visible.
20. As Andreas, I want to be told when MEMORY.md is longer than Claude loads (200 lines or 25 KB), naming the lines cut off, so that no memory is lost silently.
21. As Andreas, I want memory files that MEMORY.md never links listed, so that I can index or delete them.
22. As Andreas, I want index lines pointing at missing files listed, so that the index stays true.
23. As Andreas, I want CLAUDE.md files over 40,000 characters flagged, so that I hear Claude Code's warning before it does.
24. As Andreas, I want unmatched `[[links]]` shown as notes, not problems, so that the memory convention isn't treated as a fault.
25. As Andreas, I want the drift check in tour step 6 with the three kinds (This project, Account, Across projects…), so that one place covers all of it.
26. As Andreas, I want the old Clean up menu gone, so that there is one way to check drift.
27. As Andreas, I want a cost note and model and effort pickers before starting a drift check, so that I choose what to spend.
28. As Andreas, I want Start to send the prompt itself while I stay in Context, so that I can watch the findings arrive.
29. As Andreas, I want the run's steps shown ticking off while it runs, so that I can follow its progress.
30. As Andreas, I want findings to appear on their blocks as the run writes them, so that I see what's wrong in context.
31. As Andreas, I want each drift finding to show what's wrong, the evidence and the proposed fix, so that I can judge it without opening the chat.
32. As Andreas, I want "Open chat" to jump to the run's session in Work, so that I can talk to it.
33. As Andreas, I want a checkbox on every finding and "Apply N fixes", so that I choose exactly what changes.
34. As Andreas, I want ticked findings sent to the run's chat, which marks each applied or skipped, so that the map shows what was done.
35. As Andreas, I want a new session started for the fixes when the run's chat is gone, so that old findings can still be fixed.
36. As Andreas, I want health-check findings fixable the same way, so that fixing has one path.
37. As Andreas, I want the map to show the latest drift check covering this workspace with its date, so that I know how fresh it is.
38. As Andreas, I want findings whose file has changed since the run dimmed and marked, so that I don't act on stale advice.
39. As Andreas, I want account-file findings shown on every workspace of that account, marked as affecting all of them, so that I know an account fix's reach.
40. As Andreas, I want a cross-project run's findings to show on each covered workspace's map, so that one run serves them all.
41. As Andreas, I want the Map to say when a workspace's folder is gone instead of drawing empty lanes, so that I know why.
42. As Andreas, I want the Map's numbers to match Files' numbers, so that the two never disagree.

## Implementation Decisions

- **Context report gains memory facts.** The reader adds, for the memory index item: its line count, its byte size, the memory files it links (from markdown links to `.md` files) and the index lines whose link target is missing. Each memory file item gets `indexed: boolean`, and unmatched `[[name]]` links within memory are collected (a match is a file's base name or its frontmatter `name`). CLAUDE.md items carry their character count. The report stays free of UI types.
- **Health check (shared, pure).** `healthCheck(report) → Finding[]`, with fixed rules:
  - MEMORY.md over 200 lines or over 25,600 bytes → one finding on MEMORY.md naming the first line that is cut off and how many lines are lost.
  - Each unindexed memory file → one finding on that file (verdict `structural`).
  - Each index line to a missing file → one finding on MEMORY.md.
  - CLAUDE.md (any layer, any import) over 40,000 characters → one finding.
  - Unmatched `[[links]]` → notes (`severity: 'note'`), never counted as problems.
  - Health finding ids are stable across redraws: `H-<rule>-<hash of path and detail>`.
- **Findings contract (shared, versioned; ADR 0005).** One JSON file per run in the app data folder under `drift-checks/`. The shape is generic so later checks reuse it:

  ```ts
  type FindingsRun = {
    version: 1
    check: 'drift'                       // later: 'board', 'general'
    scope: 'project' | 'account' | 'cross-project'
    runId: string
    sessionId: string
    startedAt: string                    // ISO
    accountFolder: string
    workspaces: string[]                 // covered workspace paths
    steps: { id: string; title: string; status: 'pending' | 'running' | 'done' }[]
    findings: Finding[]
    done: boolean
  }
  type Finding = {
    id: string                           // F1, F2… (drift) or H-… (health)
    path: string                         // absolute path of the file it concerns
    verdict: 'stale' | 'wrong' | 'duplicate' | 'structural'
    severity: 'problem' | 'note'
    claim: string
    evidence: string
    fix: string
    status: 'open' | 'applied' | 'skipped'
  }
  ```

  - The app writes the run's skeleton (everything except the session's steps and findings, which start as `[]`) before starting the session. After that, only the session writes the file.
  - A parser (shared, pure) reads the file tolerantly: a half-written or invalid file keeps the last good parse and shows "run is writing…". Unknown versions are refused with a note.
- **Drift-check prompt builder** replaces the cleanup builder (same inputs, same covered files and three kinds). It also tells the session the findings file's path, the schema, to set the steps first (one per subagent), to update a step's status and append findings as each subagent reports, and to mark findings `applied` or `skipped` when asked to fix them. It still says that account files are shared by every workspace of the account. `addDirs` gains the findings folder.
- **Latest run per workspace.** The newest run file whose `workspaces` include the workspace, plus the newest account or cross-project run for the workspace's account folder (for account-file findings). Older runs are kept and not shown.
- **Staleness:** a finding is stale when its file's modified time is later than the run's `startedAt`.
- **Live follow.** While the Map is visible and the shown run is not `done`, the main process watches that one run file and pushes updates. No other Context file is watched. It uses the existing watch pattern (the test-flow watches).
- **Starting with a sent prompt.** Session navigation's start-session path gains a `send` option: the session is created with the chosen model, effort and added folders, starts its process, and is sent the prompt as its first message, without leaving the current view. The chat lives in Work as every hosted chat does (ADR 0004). Without `send`, behaviour is unchanged.
- **Applying fixes.** "Apply N fixes" sends one message to the run's session: the findings file path and the ticked ids, asking it to apply those and mark each one. If the session no longer exists, a new session on the same workspace (same added folders) is started and sent that message. Health findings go to the latest run's session in the same way, or to a new session whose message lists the ticked health findings in full, because they are in no file.
- **Context map layout (renderer, pure).** `mapLayout(report, findings) → lanes → bands → blocks`, with each block's size from tokens (a floor for zero-token items), groups of more than 8 items collapsed, and edges for imports and index links. It is drawn as hand-made SVG and HTML with no new dependency.
- **Tour copy:** fixed text in the app per step and per item kind, with the workspace's numbers filled in. The explanation per kind says how Claude loads it (for example: "Skills: only the name and description load at start; the body loads when the skill is used").
- **Context store** gains `pane: 'files' | 'map'` (not saved) and the map's selected block and tour step. Leaving Files with unsaved edits uses the existing leave guard.

## Testing Decisions

- Good tests check what Andreas sees or what Claude is told, from real arrangements of files: these folders → these findings; this run file → these blocks show these findings. They don't test how SVG is laid out.
- **Seam 1, the reader**, extended in its existing temp-folder tests: MEMORY.md line count, bytes, linked files, missing targets, `indexed`, unmatched `[[links]]` (by base name and frontmatter name), CLAUDE.md character counts.
- **Seam 2, the health check**, unit-tested from reports: the 200-line and 25,600-byte edges (200 lines is fine, 201 is a finding), unindexed files, missing targets, the 40,000-character edge, `[[links]]` as notes, stable ids.
- **Seam 3, the findings contract**: the parser (valid, half-written, unknown version), latest-run selection (project, account and cross-project runs across two workspaces of one account and one of another), staleness by modified time.
- **Seam 4, the drift-check prompt builder**, replacing the cleanup builder's tests: the same coverage assertions, plus the findings path and schema in the prompt, and the findings folder in `addDirs`.
- **Seam 5, the map layout**, unit-tested: bands per kind, collapsed groups over 8, import and index edges, findings attached to the right blocks.
- **Seam 6, the UI**, on the fake CLI. The fake CLI gains a `write_file` event (writes real content to a path, with `{findingsPath}` substituted from the prompt). The existing Clean up scenario in the Context spec is rewritten, so the budget stays at 13 of 20: Map → tour Next to step 5 shows the seeded MEMORY.md-over-200-lines finding → step 6 → This project → Start → the fake run writes a finding → it appears on its block → tick → Apply → the fake CLI log shows the message carrying that finding id. One scenario.

## Out of Scope

- Board cleanup and general cleanup (the contract allows them; they are later flows).
- App-side fixes without Claude (adding index lines, trimming MEMORY.md).
- A run history list or comparing runs.
- Pan and zoom, or free-form graph layout.
- Live token counts from the CLI (/context).
- Scheduling drift checks or reminding Andreas to run one.
- Health rules beyond the four listed (duplicates found 0 on real data and are left to the drift check).

## Further Notes

- Dry runs on Andreas's data on 2026-11-25: continuum MEMORY.md has 225 lines; darkfall64 has 137 of 396 memory files unindexed, Darkfall 26 of 173; no index line points at a missing file; the biggest CLAUDE.md is continuum's at 11,173 characters; exact duplicate lines between the account and repo CLAUDE.md files: 0.
- The 200-line and 25 KB limits and the 40,000-character warning follow Claude Code's behaviour today. If Claude changes them, the health check's tests are where they are pinned.
