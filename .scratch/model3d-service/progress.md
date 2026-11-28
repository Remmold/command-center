# model3d-service progress

Base commit: c4815e9 (main, Release 0.1.35). Branch `feat/model3d-service`, worktree `C:\projects\personal\command-center-model3d`. Local only, no push.

- grill done: glossary + ADR 0011 — 49a61fa
- 01 built: 3D service core (src/main/model3d: queue, GPU turn, server lifecycle, coord claim, idle stop, restart cleanup, history cap; session env) — b950c99, review fix e6e17d2
- 02 resolved: gen3d.py client of the 3D service (request + wait, wait reasons, --no-wait, ui editor turn, stop refusal, --service-worker markers and client_id; fallback unchanged; pytest 20 in the skill folder; skill snapshot in model3d-skill/) — 6c5d426
- 03 resolved: 3D view on Ctrl+6 (service header, Stop server with outside confirm, job list newest first with session/workspace/account, progress, wait reason, error); IPC model3d:*; e2e fakes in e2e/fakes (ComfyUI, gen3d worker, coord) guarded off the real ones; scenario (a), 18 of 20 — a9bf1dc, review fix df9fec2
- 04 resolved: wait reasons in order, Run anyway (flag + button), Cancel queued/running (/interrupt, worker kill, /queue clear), orphan drop; service.json through a fakeable port (slow-test cause fixed, default limits back); e2e scenario (b), 19 of 20 — 49a8114, review fix 88b7b17
- 04 resolved: fix wait checks awaited inside the serial chain after a turn ended (slow tasklist/coord kept the stale turn reason and blocked the queue); rounds now run outside the chain, newer round wins — d0fb399
- 05 built: viewer (three.js bundled, orbit/wireframe/lit-unlit, .json stats with scene-count fallback, sheet, job models, Open model…, .glb Media tiles opening the 3D view; e2e (a) extended, 19 of 20) — 49040d7
