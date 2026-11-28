# Shared 3D service: one ComfyUI3D server, one GPU queue, a 3D view

Status: ready-for-agent

## Problem Statement

Every session that runs the `model3d` skill starts ComfyUI3D (port 8189) itself and stops it when its own batch ends, so with two sessions the first one to finish kills the other's run. Nothing stops two sessions, or a session plus Unity or the Darkfall cluster, from loading models onto the 16 GB GPU at once. The machine has crashed from that before. Finished models are just files in each project's folder: to look at one, Andreas opens Blender. The main chat doesn't know the pipeline exists.

## Solution

Command Center owns the **3D service** (ADR 0011): one ComfyUI3D server for every session and account. It starts when a **3D job** or the editor needs it, stops after 10 minutes idle, and is never stopped while a job is queued or running. Sessions keep calling `gen3d.py` exactly as today. When the app is running, `gen3d.py` drops a request into the **jobs folder** and waits. The app gives one job at a time its **GPU turn**, runs it as a worker process, and writes back status, progress and results. When the app isn't running, `gen3d.py` falls back to today's start, run and stop.

The new top-level **3D view** lists the jobs: queued with their **wait reason**, running with progress, then done, failed or cancelled, each with the session that asked and a Cancel button. It also previews any `.glb` with orbit, wireframe, lit/unlit, the stats from its `.json` and its contact sheet. An Open editor button takes an **editor turn** and opens `http://127.0.0.1:8189`. The main chat gets one rule line and a `# 3D models` digest section.

## User Stories

1. As Andreas, I want one ComfyUI3D server shared by every session, so that one session finishing never kills another's run.
2. As a session, I want to run `gen3d.py` with the same arguments and get the same stdout (GLB and sheet paths), so that the skill works unchanged when the app is running.
3. As a session, I want `gen3d.py` to fall back to today's start, run and stop when Command Center isn't running, so that the skill still works without the app.
4. As Andreas, I want 3D jobs from every session and account to run one at a time, so that two jobs never load models onto the GPU together.
5. As Andreas, I want a job to wait while the Darkfall cluster (`SFGamelogicServer.exe` / `SFGamelogicDistributor.exe`) or Unity (`Unity.exe`) runs, with a wait reason such as "Waiting: Darkfall cluster running", so that I know why it isn't running.
6. As Andreas, I want a job to wait while another job holds the coord board's `gpu` claim, with the reason "Waiting: gpu claimed by <job> since <HH:MM>", so that the app respects Darkfall's coordination.
7. As Andreas, I want a Run anyway button on a waiting job that skips the cluster, Unity and coord-claim checks (today's `--force`), so that I can override a stale claim or accept the RAM risk. It never skips the GPU turn.
8. As Andreas, I want the app to claim `gpu` on the coord board as job `command-center-3d` from server start to server stop, and release it when the server stops, so that Darkfall jobs see the GPU is taken even while the server idles with ~10 GB in VRAM.
9. As Andreas, I want the server stopped 10 minutes after the queue empties and no editor turn is held, and a Stop server button that stops it at once (it refuses while a job runs), so that VRAM comes back when I'm done.
10. As Andreas, I want a server that was started outside the app to be used when nobody else claims the GPU, but never stopped by the idle timer, marked "Started outside the app". Stop server still works on it after a confirm.
11. As a session, I want `gen3d.py` to print the wait reason each time it changes while it waits, so that the session can tell me why nothing is happening.
12. As a session, I want `--no-wait` to submit the job, print its id and return, so that I can carry on and pick up the results later.
13. As Andreas, I want a queued job dropped when the `gen3d.py` that waits on it has died (Ctrl+C, session stopped), so that no ghost job takes a GPU turn. A `--no-wait` job is never dropped this way, and a running job always finishes.
14. As Andreas, I want to see each job's session, workspace, account, input (picture names or prompt and count), preset, state, wait reason, progress (item i of n, stage, sampling step N/M) and duration, so that I know what is using the GPU.
15. As Andreas, I want to cancel a queued job (removed at once) or a running one (ComfyUI interrupted, its queue cleared, the worker stopped), so that I can free the GPU. The waiting `gen3d.py` exits non-zero with "Cancelled in Command Center".
16. As Andreas, I want a failed job to show the error line the worker gave, so that I can tell the session what went wrong.
17. As Andreas, I want each finished job to list its models, and a click to open a model in the viewer, so that I can review a batch.
18. As Andreas, I want to open any `.glb` from disk in the 3D view (Open model… picker), so that I can look at models from any session or from earlier.
19. As Andreas, I want a `.glb` in any chat's Media tab to show as a tile that opens it in the 3D view, so that I can jump from the chat to the model.
20. As Andreas, I want the viewer to orbit, pan and zoom, toggle wireframe, and switch between lit and unlit, so that I can judge shape, topology and texture.
21. As Andreas, I want the triangle count and texture sizes from the model's `.json`, falling back to counting them from the GLB when there is no `.json`, plus the preset, seconds and bounding size when present, so that I can check the game budget.
22. As Andreas, I want the contact sheet (`<name>_sheet.png`) beside the viewer when it exists, so that I can compare input and renders.
23. As Andreas, I want the viewer to work fully offline, with the viewer library bundled in the app, so that it works without internet and in e2e.
24. As Andreas, I want an Open editor button that takes an editor turn (queued like a job, starting the server if needed), opens `http://127.0.0.1:8189` in my browser and pauses the idle stop, and a Done with editor button that ends the turn, so that my live tweaks never run beside a job.
25. As a session, I want `gen3d.py ui` to request an editor turn from the app and `gen3d.py stop` to refuse with "The 3D server belongs to Command Center; stop it in the 3D view" when the app is running, so that a session can't kill the shared server.
26. As Andreas, I want quitting with jobs queued or running, or an editor turn held, to ask first. When I confirm, the jobs are cancelled with "Cancelled: app closed", an app-started server is stopped and the claim is released.
27. As Andreas, I want the last 50 finished jobs kept across restarts, so that the list and the main chat still see them.
28. As Andreas, I want queued and running jobs not to survive a restart: a job file left from a crash shows as "Cancelled: app closed" on the next start, and a stale `command-center-3d` claim is released, so that nothing resumes behind my back.
29. As the main chat, I want a rule telling me to suggest `model3d` when an idea needs 3D assets (a session runs it; I can't), so that Andreas gets the pipeline when it fits.
30. As the main chat, I want a `# 3D models` digest section listing queued and running jobs and the last 10 finished models (name, `.glb` path, session, workspace, tris, finished time), so that I can point Andreas at finished models and tell him to open them in the 3D view.
31. As a session, I want the `model3d` SKILL.md to describe the shared service (queue, wait reasons, `--no-wait`, the 3D view, the fallback), so that sessions use it right.
32. As Andreas, I want the 3D view on the view strip as "3D" after Processes (Ctrl+6), so that it is one click away.

## Implementation Decisions

**Jobs folder (the hand-off, ADR 0011).** `<userData>/model3d-jobs/`, so `%APPDATA%\command-center\model3d-jobs\` in the installed app. The app passes its path to every hosted session as `CC_MODEL3D_JOBS`, and `gen3d.py` uses that or the default path. Each file has one writer:
- `<id>.request.json`, written once by `gen3d.py`: `id`, `kind` (`generate` | `editor`), `argv` (the original arguments), `cwd`, `python` (the submitter's interpreter), `script` (gen3d.py's path), `waiterPid`, `wait` (false for `--no-wait`), `sessionId` (from `CC_SESSION_ID`), `configDir` (from `CLAUDE_CONFIG_DIR`, empty for the default account), `submittedAt`, and a short `summary` (picture names or prompt + count, preset).
- `<id>.status.json`, written only by the app, atomically: `state` (`queued` | `running` | `done` | `failed` | `cancelled`), `waitReason`, `progress` (`item`, `of`, `name`, `stage`, `step`, `steps`), `startedAt`, `endedAt`, `error`, `outputs` (list of `{glb, sheet?, json?}`).
- `service.json`, written only by the app: `pid`, `heartbeatAt` (every 5 s), `server` (`stopped` | `starting` | `ready` | `stopping`), `startedByApp`. `gen3d.py` treats the service as up when `heartbeatAt` is under 15 s old and the pid is alive. Otherwise it uses the fallback.

**The app-side 3D service** (main process, one deep module). It watches the folder, keeps the queue (FIFO by `submittedAt`) and owns the server, the GPU turn, the coord claim and the idle timer. It talks to the outside through narrow ports, so tests can fake each one:
- process list: `tasklist`;
- coord board: `python -I C:\dfst_coord\coord.py claim|unclaim command-center-3d gpu`, `claims gpu`, skipped when the file is missing;
- ComfyUI client: `/system_stats`, `/interrupt`, `/queue` clear, `/free`, and the `/ws` progress messages;
- server launcher: `C:\ComfyUI3D\.venv\Scripts\python.exe main.py --port 8189`, cwd `C:\ComfyUI3D`, output to `server.log`, ready when `/system_stats` answers, 120 s timeout;
- worker runner.

The ports come from config with env overrides for e2e: engine dir, port, coord script, and the process names. While anything waits, the checks run every 5 s, in this order. The first hit is the wait reason:
1. another job or the editor holds the GPU turn ("Waiting: <summary> running" / "Waiting: editor open");
2. `SFGamelogicServer.exe`/`SFGamelogicDistributor.exe` ("Waiting: Darkfall cluster running") or `Unity.exe` ("Waiting: Unity running");
3. a `gpu` claim on the coord board by any job other than `command-center-3d` ("Waiting: gpu claimed by <job> since <HH:MM>").

Run anyway skips checks 2 and 3. Blender is not a check, because the worker uses it for the contact sheet.

**Server lifecycle.** The app starts the server for a job's or an editor's GPU turn and claims `gpu` before it starts. An idle timer of 10 minutes runs only while the queue is empty, no turn is held and the app started the server. When it fires, the app stops the server's process tree and unclaims. A server already answering on 8189 is used when check 3 passes; it is marked "Started outside the app" and never idle-stopped. Stop server (after a confirm) still stops it. The app claims `gpu` while it uses an outside server and unclaims when the queue empties.

**Worker.** At a job's turn the app runs `<python> <script> <argv…> --service-worker` in the request's `cwd`. `--service-worker` means: no guards, no server start or stop, no coord calls, and the existing `/free` between stages is kept. Besides today's stdout paths, it prints a progress marker on stderr: `@@model3d {"item":i,"of":n,"name":…,"stage":"picture"|"mask"|"generate"|"render"}`. The sampling step `N/M` comes from ComfyUI's `/ws` progress messages. Outputs are read from stdout (a `.glb` line, then its `_sheet.png` line) plus the `.json` next to each GLB. A non-zero exit, or a batch with no output, is `failed`, with the last `FAILED`/error line as `error`. Cancel sends `/interrupt` and clears the queue, kills the worker tree and sets `cancelled`.

**gen3d.py client** (in the skill folder, allowed edit). When the service is up it writes the request and polls its status file every 2 s. It prints each new wait reason on stderr. When the job is done it prints the same stdout as today and exits 0; when failed or cancelled it exits non-zero with the reason. `ui` submits an `editor` request without waiting. `stop` refuses. `--force` sets the request's run-anyway flag. The fallback path is today's code, unchanged.

**Orphans and restart.** While a job is queued, the app checks `waiterPid` every 5 s when `wait` is true, and drops the job (status `cancelled`, "Dropped: waiting gen3d.py ended") once that pid is gone. On start, any `queued`/`running` status, or a request with no status, becomes `cancelled` "Cancelled: app closed", and a `command-center-3d` claim is released. The history keeps the newest 50 finished jobs; older request and status pairs are deleted.

**Quit.** The existing quit question counts queued and running 3D jobs and an editor turn, next to sessions and terminals. Confirming cancels them, stops an app-started server and unclaims.

**Session identity.** Hosted sessions get `CC_SESSION_ID` (the app's session id) and `CC_MODEL3D_JOBS` in their environment. The view shows the session title when the id is known. Otherwise it shows "Outside the app · <cwd folder name>", with the workspace matched from `cwd` and the account from `configDir`.

**3D view.** `AppView` gains `3d`, labelled "3D", after Processes (Ctrl+6). Left: a service header (server state, "Started outside the app", Stop server, Open editor / Done with editor) and the job list, newest first, with Cancel and Run anyway. Right: the viewer for the selected model. The viewer uses three.js (a pnpm dependency, bundled, with no CDN) with GLTFLoader and OrbitControls. It has a wireframe toggle and lit/unlit (unlit swaps in basic materials with the same base colour map). Stats come from `<name>.json` (`tris`, texture sizes, `preset`, `seconds`, size), or from counting the scene when there is no `.json`. The contact sheet sits beside it. GLBs load through the existing `cc-media://` protocol, which gains `.glb` (`model/gltf-binary`, kind `model`). Open model… uses a native file picker, and the chosen path is allowed through the same `resolveMedia` gate.

**Media tab.** The chat's media collector recognises `.glb` paths, and its tile opens the model in the 3D view.

**Main chat.** One rule line in its instructions: suggest `model3d` when an idea needs 3D assets, say a session runs it, and point at finished models by path and the 3D view. The digest gains `# 3D models`: queued and running jobs (summary, session, state or wait reason), then the last 10 finished models (name, `.glb` path, session, workspace, tris, finished time).

**SKILL.md.** Rewrite the Quick use and Safety rules sections for the shared service: the queue, wait reasons, `--no-wait`, `ui`/`stop` behaviour, the 3D view and the fallback when the app is not running.

## Testing Decisions

Test behaviour at the highest seam: what goes into the jobs folder and what the view shows, never internal state.

- **Seam 1 (primary): the 3D service module, in Vitest**, with a real temp jobs folder and fakes for the clock, process list, coord board, ComfyUI client, server launcher and worker runner. It covers:
  - FIFO and one GPU turn;
  - each wait reason and its order;
  - Run anyway;
  - claim from server start to stop;
  - the 10-minute idle stop, and no idle stop for an outside server;
  - orphan drop, and no drop for `--no-wait`;
  - cancel while queued and while running;
  - failure from a non-zero exit;
  - restart cleanup;
  - the history cap of 50;
  - the editor turn.

  Prior art: `src/main/features/serverRunner` tests and the drift-check file tests.
- **Seam 2: the UI, in Playwright e2e on fake engines.** The env points the engine port at a tiny fake ComfyUI (answers `/system_stats`, `/interrupt`, `/queue`, `/free`, `/ws`), the worker at a fake script that prints the stdout and progress lines and copies a tiny fixture GLB, sheet and `.json`, and the coord script at a fake. Two scenarios:
  - (a) a dropped request goes queued → running → done, and opening its model shows the canvas, tri count, texture sizes and sheet;
  - (b) a job waits with a coord-claim wait reason, and Cancel ends it as cancelled.

  The budget goes from 17 to 19 of 20. The view strip changes, so the whole UI suite runs once.
- **Smaller seams:**
  - the digest builder and the media collector, in Vitest, next to their existing tests;
  - the `gen3d.py` client, in pytest in the skill folder: submit and wait, wait-reason printing, `--no-wait`, fallback detection when `service.json` is stale, `stop` refusal.

## Out of Scope

- New generation models and workflows.
- GLB-to-game-format converters.
- Any change to `C:\ComfyUI` (port 8188).
- Jobs resuming after a restart.
- An "Open model" action card for the main chat.
- Running the editor inside the app window.
- Any repo change outside this repo except `C:\Users\remmold\.claude\skills\model3d\*`.

## Further Notes

- On 2026-11-28 a `gen3d.py` run was live with the Darkfall cluster up (2× SFGamelogicServer + Distributor, ~2.2 GB) and its own `model3d` claim on the board. Run anyway exists for that case.
- The first job after a server start pays a 2–4 min model load; the 10-minute idle stop covers back-to-back runs.
- Lane 2 (Andreas): the real engine end to end (two sessions at once, the idle stop, the editor turn), and judging the viewer's look.
