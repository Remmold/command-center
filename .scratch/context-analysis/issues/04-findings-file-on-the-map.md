# 04: Drift-check findings files shown on the map

**What to build:** the app reads drift-check run files from its data folder and shows the latest run's findings on the map with the run's date and staleness (spec: `.scratch/context-analysis/spec.md`, ADR 0005). This can be verified by placing a run file by hand; nothing starts a run yet.

Rules (from the spec, word for word):
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
  ```
  - A parser (shared, pure) reads the file tolerantly: a half-written or invalid file keeps the last good parse and shows "run is writing…". Unknown versions are refused with a note.
- **Latest run per workspace.** The newest run file whose `workspaces` include the workspace, plus the newest account or cross-project run for the workspace's account folder (for account-file findings). Older runs are kept and not shown.
- **Staleness:** a finding is stale when its file's modified time is later than the run's `startedAt`.
- **Live follow.** While the Map is visible and the shown run is not `done`, the main process watches that one run file and pushes updates. No other Context file is watched. It uses the existing watch pattern (the test-flow watches).
- The map shows the latest drift check covering this workspace with its date ("checked 3 days ago"). A finding whose file changed after the run started is dimmed with "file changed since". Account-file findings show on every workspace of that account, marked as affecting all of them. A cross-project run's findings show on each covered workspace's map. The run's steps show with their status.

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] Contract tests (seam 3): the parser (valid, half-written, unknown version); latest-run selection (project, account and cross-project runs across two workspaces of one account and one of another); staleness by modified time.
- [ ] Drift findings show on their blocks next to health findings, with the run date and the step list; stale ones are dimmed and marked.
- [ ] A run file being rewritten while the map is open updates the map without a refresh; once it reads `done: true`, the watch stops.
- [ ] Quick tier green.
