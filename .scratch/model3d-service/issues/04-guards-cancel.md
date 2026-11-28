# 04: Jobs wait with a reason, Run anyway, Cancel, orphan drop

**What to build:**
- Waiting jobs show the right wait reason, and Run anyway skips the RAM and coord checks.
- Cancel works on queued and running jobs.
- A queued job whose waiting `gen3d.py` has died is dropped.

Spec: `.scratch/model3d-service/spec.md`.

**Blocked by:** 03

**Status:** in-progress

- [ ] While anything waits, the checks run every 5 s, in this order; the first hit is the wait reason:
  1. another job or the editor holds the GPU turn ("Waiting: <summary> running" / "Waiting: editor open");
  2. `SFGamelogicServer.exe`/`SFGamelogicDistributor.exe` ("Waiting: Darkfall cluster running") or `Unity.exe` ("Waiting: Unity running");
  3. a `gpu` claim on the coord board by any job other than `command-center-3d` ("Waiting: gpu claimed by <job> since <HH:MM>").
- [ ] Blender is not a check.
- [ ] Run anyway (a button on a waiting job, or the request's run-anyway flag) skips checks 2 and 3, never check 1.
- [ ] Cancel on a queued job removes it at once (`cancelled`). On a running job it sends `/interrupt`, clears ComfyUI's queue, kills the worker tree and sets `cancelled`.
- [ ] Orphan drop: while a job is queued with `wait: true`, the app checks `waiterPid` every 5 s and drops the job (`cancelled`, "Dropped: waiting gen3d.py ended") once that pid is gone. `--no-wait` jobs are never dropped, and a running job always finishes.
- [ ] Vitest (seam 1) covers each wait reason and its order, Run anyway, both cancels and the orphan drop.
- [ ] e2e scenario (b): a job waits with a coord-claim wait reason, and Cancel ends it as cancelled. Budget 19 of 20.
