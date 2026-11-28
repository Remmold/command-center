# 05: Preview any GLB in the 3D view

**What to build:** the viewer half of the 3D view:
- three.js, bundled with no CDN, so it works offline;
- orbit, wireframe and lit/unlit;
- stats from the model's `.json` (or counted from the GLB) and the contact sheet beside it;
- opened from a finished job's models, an Open model… picker, or a `.glb` tile in any chat's Media tab.

Spec: `.scratch/model3d-service/spec.md`.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] three.js is a pnpm dependency with GLTFLoader and OrbitControls, bundled into the renderer; no network request is made.
- [ ] Orbit, pan and zoom. A wireframe toggle. Lit/unlit, where unlit swaps in basic materials with the same base colour map.
- [ ] Stats come from `<name>.json` (`tris`, texture sizes, `preset`, `seconds`, size). Without a `.json`, the triangle count and texture sizes are counted from the scene.
- [ ] `<name>_sheet.png` shows beside the viewer when it exists.
- [ ] GLBs load through `cc-media://`, which gains `.glb` (`model/gltf-binary`, kind `model`). Open model… uses a native file picker, and the path passes the same `resolveMedia` gate.
- [ ] Each finished job lists its models, and a click opens one in the viewer.
- [ ] The chat's media collector recognises `.glb` paths, and its tile opens the model in the 3D view (Vitest next to the collector's tests).
- [ ] e2e scenario (a), second half: opening the done job's model shows the canvas, tri count, texture sizes and sheet (still 19 of 20, no new scenario).
