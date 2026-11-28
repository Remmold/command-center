# 01: The 3D service runs dropped jobs one at a time on one server

**What to build:** the app-side 3D service, with no UI yet. A `<id>.request.json` dropped into the jobs folder is queued, gets its GPU turn and runs as a worker, and its `<id>.status.json` goes `queued` → `running` → `done` (or `failed`), with progress and outputs. The app starts ComfyUI3D for the turn, claims `gpu` on the coord board for as long as the server is up, and stops the server after 10 minutes idle. Everything is verifiable from the folder and the Vitest seam. Spec: `.scratch/model3d-service/spec.md`, ADR 0011.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] The jobs folder is `<userData>/model3d-jobs/` and is created on start. Hosted sessions get `CC_MODEL3D_JOBS` (that path) and `CC_SESSION_ID` (the app's session id) in their environment.
- [ ] Request schema: `id`, `kind` (`generate` | `editor`), `argv`, `cwd`, `python`, `script`, `waiterPid`, `wait`, `sessionId`, `configDir`, `submittedAt`, `summary`, plus a run-anyway flag.
- [ ] Status schema: `state` (`queued` | `running` | `done` | `failed` | `cancelled`), `waitReason`, `progress` (`item`, `of`, `name`, `stage`, `step`, `steps`), `startedAt`, `endedAt`, `error`, `outputs` (list of `{glb, sheet?, json?}`).
- [ ] Each file has one writer; the app writes status atomically.
- [ ] `service.json` (app-written): `pid`, `heartbeatAt` (every 5 s), `server` (`stopped` | `starting` | `ready` | `stopping`), `startedByApp`.
- [ ] The queue is FIFO by `submittedAt`, with one GPU turn at a time. A job waiting behind another reads "Waiting: <summary> running".
- [ ] Ports (clock, process list, coord board, ComfyUI client, server launcher, worker runner) are injectable. Config has env overrides for the engine dir, port, coord script and process names (used by e2e later).
- [ ] Server start: `C:\ComfyUI3D\.venv\Scripts\python.exe main.py --port 8189`, cwd `C:\ComfyUI3D`, output to `server.log`.
  - It is ready when `/system_stats` answers, with a 120 s timeout.
  - The app claims `gpu` (`python -I C:\dfst_coord\coord.py claim command-center-3d gpu`) before the start.
  - Coord calls are skipped when the file is missing.
- [ ] Idle stop: a timer of 10 minutes runs only while the queue is empty, no turn is held and the app started the server. When it fires, the server's process tree is stopped and `gpu` is unclaimed.
- [ ] A server already answering on 8189 is used when no other job claims `gpu`.
  - It is marked "Started outside the app" (`startedByApp: false`) and is never idle-stopped.
  - The app claims `gpu` while it uses that server and unclaims when the queue empties.
- [ ] Worker: `<python> <script> <argv…> --service-worker` in the request's `cwd`.
  - The `@@model3d {"item":i,"of":n,"name":…,"stage":"picture"|"mask"|"generate"|"render"}` stderr markers fill `progress`.
  - The sampling step `N/M` comes from ComfyUI's `/ws` progress messages.
  - Outputs are read from stdout (a `.glb` line, then its `_sheet.png` line) plus the `.json` next to each GLB.
- [ ] A non-zero exit, or a batch with no output, is `failed`, with the last `FAILED`/error line as `error`.
- [ ] Restart cleanup: on start, any `queued`/`running` status, or a request with no status, becomes `cancelled` "Cancelled: app closed", and a `command-center-3d` claim is released.
- [ ] The history keeps the newest 50 finished jobs; older request and status pairs are deleted.
- [ ] Vitest (seam 1) covers each criterion above with a real temp folder and fakes.
