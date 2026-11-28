# 06: Editor turn and quitting with jobs

**What to build:**
- Open editor takes an editor turn (queued like a job), starts the server if needed, opens `http://127.0.0.1:8189` in the browser and pauses the idle stop. Done with editor ends the turn.
- An `editor` request from `gen3d.py ui` does the same.
- Quitting with work in the 3D service asks first, then cleans up.

Spec: `.scratch/model3d-service/spec.md`.

**Blocked by:** 04

**Status:** ready-for-agent

- [ ] Open editor / Done with editor sit in the service header. While the editor turn is held, queued jobs read "Waiting: editor open" and the idle stop is paused.
- [ ] An `editor` request in the jobs folder takes the same turn and opens the browser when it starts.
- [ ] The existing quit question counts queued and running 3D jobs and an editor turn, next to sessions and terminals. Confirming cancels them with "Cancelled: app closed", stops an app-started server and unclaims `gpu`.
- [ ] Vitest (seam 1) covers the editor turn and the quit cleanup; the quit question's count is tested next to its existing tests.
