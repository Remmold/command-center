# 02: gen3d.py hands jobs to the app and keeps its fallback

**What to build:** `gen3d.py` in `C:\Users\remmold\.claude\skills\model3d\`, the one allowed edit outside the repo:
- When the 3D service is up, it submits its run as a request, waits and prints the same stdout as today.
- It gains `--service-worker` mode for the app's worker.
- When the app isn't running, it falls back to today's start, run and stop, unchanged.
- SKILL.md describes the shared service.

Spec: `.scratch/model3d-service/spec.md`.

**Blocked by:** 01

**Status:** in-progress

- [ ] The jobs folder is `CC_MODEL3D_JOBS`, or the default `%APPDATA%\command-center\model3d-jobs\`. The service counts as up when `service.json`'s `heartbeatAt` is under 15 s old and its pid is alive; otherwise the fallback path runs (today's code).
- [ ] When the service is up:
  - gen3d.py writes `<id>.request.json` once (schema from ticket 01) and polls its status every 2 s.
  - It prints each new wait reason on stderr.
  - On `done` it prints today's stdout (GLB and sheet paths) and exits 0.
  - On `failed` or `cancelled` it exits non-zero with the reason ("Cancelled in Command Center" when Andreas cancels).
- [ ] `--no-wait` submits (`wait: false`), prints the job id and returns. `--force` sets the request's run-anyway flag.
- [ ] `ui` submits an `editor` request without waiting. `stop` refuses with "The 3D server belongs to Command Center; stop it in the 3D view" while the service is up.
- [ ] `--service-worker` runs no guards, does no server start or stop and makes no coord calls. It keeps the `/free` between stages and prints the `@@model3d {...}` stderr markers with stages `picture`, `mask`, `generate`, `render`.
- [ ] SKILL.md's Quick use and Safety rules describe the queue, wait reasons, `--no-wait`, `ui`/`stop`, the 3D view and the fallback.
- [ ] pytest in the skill folder covers:
  - submit and wait;
  - wait-reason printing;
  - `--no-wait`;
  - fallback detection when `service.json` is stale;
  - the `stop` refusal.
