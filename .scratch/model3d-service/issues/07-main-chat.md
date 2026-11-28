# 07: The main chat knows the 3D pipeline

**What to build:** the main chat gets one rule line and a `# 3D models` digest section, so it suggests `model3d` and points at finished models. Spec: `.scratch/model3d-service/spec.md`.

**Blocked by:** 01

**Status:** resolved

- [x] One rule line in the main chat's instructions: suggest `model3d` when an idea needs 3D assets, say a session runs it, and point at finished models by path and the 3D view.
- [x] The digest gains `# 3D models`: queued and running jobs (summary, session, state or wait reason), then the last 10 finished models (name, `.glb` path, session, workspace, tris, finished time).
- [x] Vitest next to the digest builder's existing tests.
