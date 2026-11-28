# 03: The 3D view lists jobs and the server

**What to build:** the top-level 3D view: Ctrl+6, labelled "3D", after Processes. It has a service header (server state, "Started outside the app", Stop server) and the job list, newest first, showing what each job is and who asked. The e2e harness gets fake engines, and scenario (a) runs a dropped request through to done. Spec: `.scratch/model3d-service/spec.md`.

**Blocked by:** 01

**Status:** in-progress

- [ ] `AppView` gains `3d`, labelled "3D", after Processes, on Ctrl+6.
- [ ] Each job row shows the session, workspace, account, input (picture names or prompt and count), preset, state, wait reason, progress (item i of n, stage, sampling step N/M) and duration. A failed job shows its `error` line.
- [ ] The session shows by title when `sessionId` is known. Otherwise it reads "Outside the app · <cwd folder name>". The workspace is matched from `cwd` and the account from `configDir`.
- [ ] Stop server stops it at once and refuses while a job runs; on a server started outside the app it asks for a confirm first.
- [ ] e2e fakes, selected by env:
  - a tiny fake ComfyUI (`/system_stats`, `/interrupt`, `/queue`, `/free`, `/ws`);
  - a fake worker script that prints the stdout and progress lines and copies a tiny fixture GLB, sheet and `.json`;
  - a fake coord script.
- [ ] e2e scenario (a), first half: a dropped request goes queued → running → done in the view. Budget 18 of 20 (`pnpm e2e:count`).
- [ ] The view strip changed, so the whole UI suite runs once before the commit.
