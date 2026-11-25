# 03: "Clean up → This project" starts a prepared cleanup session

**What to build:** a Clean up menu in Context's layers header with "This project". Choosing it opens Work on a new session in the selected workspace (on its account) with the project cleanup prompt waiting in the input box, and the folders the prompt names outside the workspace pre-allowed with `--add-dir` (spec: `.scratch/context-cleanup/spec.md`). This ticket builds the whole path for the project kind; ticket 04 adds the other two kinds.

Rules (from the spec, word for word):
- **Cleanup prompt builder (shared, pure, the one deep module).** Input: the cleanup kind and the facts it needs: the account's name and config folder, and for each covered workspace its name, path, memory folder and Context report. Output: `{ prompt: string, addDirs: string[] }`.
  - The Context report gains `accountFolder` (the profile's config folder) and `memoryFolder` (where this workspace's memory lives, whether or not it exists yet), so the builder never re-derives paths.
  - The prompt lists the files to check by path, taken from the report: for a project, the repo and local layers' CLAUDE.md files, imports, subfolder CLAUDE.md files, repo skills, agents and commands, plus the memory folder, and `GLOSSARY.md`, `docs/adr/` and `docs/agents/` when they exist in the workspace; for the account, the account layer's CLAUDE.md files and imports, the account's own skills, agents, commands and settings (plugin items are left out: they belong to the plugin, not to Andreas).
  - The prompt's instructions, in order: (1) one subagent per covered project, plus one for the account files when covered; (2) each subagent checks every concrete claim (paths, commands, scripts, names, versions, "currently…" statements, links, `[[memory]]` links, MEMORY.md index lines against the files) against the current code and git history, and flags duplicates between files and contradictions between layers; (3) the main session merges the results into one findings table per file: stale, wrong, duplicate, structural, or fine, each with the evidence; (4) it asks Andreas through clickable questions which fixes to apply, and edits nothing before he answers; (5) account files are shared by every workspace of the account, so the prompt says so next to any account-file fix.
  - `addDirs`: every folder the prompt names that is outside the session's workspace (the memory folder, the account folder, the other workspaces), each once.
  - The prompt is fixed text in the app; only the paths and names vary.
- **Pre-allowed folders on the session.** A hosted session gains an optional list of added folders, stored with the session as model and permission mode are, and passed to the CLI as one `--add-dir <folder>` per entry on every spawn of that session (start, restart, resume). Sessions started any other way have none, so their launch is unchanged.
- **Starting a cleanup.** Session navigation's start-session path gains options: a draft for the new chat's input, and the added folders. The draft is placed through the existing per-chat draft store before the chat mounts, so the input box opens with it. It is never sent automatically. The Context view's leave guard runs first; if Andreas keeps unsaved edits, nothing starts.
- **Clean up menu:** a button in the layers header (next to the start total) opening a menu: "This project", "Account", "Across projects…". This ticket ships "This project" only.
- The Clean up menu is hidden when the workspace folder is gone.
- The fake CLI must accept `--add-dir` (repeatable) and log it in its argv log.

**Blocked by:** 02

**Status:** resolved

- [x] Unit tests (seam 1) for the project kind: names the right files and leaves the others out (no account files in a project run; no plugin items; GLOSSARY/ADR only when present); `addDirs` holds exactly the outside folders, each once, and never the session's own workspace; the prompt carries the "ask before editing" and "one subagent per project" instructions.
- [x] The report carries `accountFolder` and `memoryFolder` (reader tests updated).
- [x] Added folders persist with the session and reach every spawn as `--add-dir`.
- [x] New UI scenario: Clean up → This project opens Work on a new session whose input holds a prompt naming the workspace's CLAUDE.md, and after sending, the fake CLI's logged argv contains `--add-dir` with the memory folder. That makes 16 of the 20-scenario budget.
- [x] Quick tier green.
