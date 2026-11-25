# 04: Account and cross-project cleanup

**What to build:** the Clean up menu's "Account" and "Across projects…" choices (spec: `.scratch/context-cleanup/spec.md`). Account starts a session in the selected workspace that checks the account's own files. Across projects opens a dialog of the account's workspaces as checkboxes (all ticked) and starts one session covering the ticked workspaces plus the account files.

Rules (from the spec, word for word):
- The prompt lists the files to check by path, taken from the report: [...] for the account, the account layer's CLAUDE.md files and imports, the account's own skills, agents, commands and settings (plugin items are left out: they belong to the plugin, not to Andreas).
- The prompt's instructions, in order: (1) one subagent per covered project, plus one for the account files when covered; (2) each subagent checks every concrete claim (paths, commands, scripts, names, versions, "currently…" statements, links, `[[memory]]` links, MEMORY.md index lines against the files) against the current code and git history, and flags duplicates between files and contradictions between layers; (3) the main session merges the results into one findings table per file: stale, wrong, duplicate, structural, or fine, each with the evidence; (4) it asks Andreas through clickable questions which fixes to apply, and edits nothing before he answers; (5) account files are shared by every workspace of the account, so the prompt says so next to any account-file fix.
- `addDirs`: every folder the prompt names that is outside the session's workspace (the memory folder, the account folder, the other workspaces), each once.
- "Across projects…" opens a dialog with the selected workspace's account's workspaces as checkboxes (all ticked), the account files always included, and a Start button disabled when none is ticked. The dialog reads each ticked workspace's report before building the prompt; a workspace whose folder is gone is listed but cannot be ticked.
- One run never mixes account files: the dialog lists only the selected workspace's account's workspaces.
- Every kind starts a new session in the selected workspace on its account, with the prompt prefilled and never sent automatically; the Context view's leave guard runs first.

**Blocked by:** 03

**Status:** resolved

- [x] Unit tests (seam 1) for the account and cross-project kinds: right files in, plugin items out, every covered workspace's files and memory folder named, `addDirs` exactly the outside folders each once (account folder, other workspaces, their memory folders), never the session's own workspace; the cross-project prompt asks for one subagent per project plus one for the account.
- [x] "Account" and "Across projects…" work from the menu; the dialog behaves as above.
- [x] No new UI scenario (stays at 16 of 20).
- [x] Quick tier green.
