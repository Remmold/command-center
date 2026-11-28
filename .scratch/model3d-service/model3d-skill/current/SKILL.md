---
name: model3d
description: Generate textured, game-budgeted 3D models (GLB) locally from a picture or a text prompt with Pixal3D / TRELLIS.2 on ComfyUI (RTX 5070 Ti). Use in any game project when the user asks to generate, make or prototype a 3D model, prop, statue, weapon, creature mesh or asset from an image or description, or to open the visual 3D workflow editor. Triggers - "make a 3D model", "image to 3D", "generate a prop", "turn this picture into a model", "Pixal3D", "TRELLIS", "/model3d".
---

# model3d - local image/text to 3D

Shared engine: a dedicated ComfyUI at `C:\ComfyUI3D` (port 8189, own venv, ~40 GB of models). The icon/image
ComfyUI at `C:\ComfyUI` (8188) is separate; do not mix them.

## Quick use

```
python C:/Users/remmold/.claude/skills/model3d/scripts/gen3d.py --image concept.png --preset prop --out ./art/3d
python .../gen3d.py --image ./concepts/                       # every picture in a folder
python .../gen3d.py --prompt "iron-banded wooden chest" --count 3 --preset tiny
python .../gen3d.py --image concept.png --no-wait             # queue it, print the job id, return at once
python .../gen3d.py ui                                        # visual editor in the browser (user tweaks live)
python .../gen3d.py stop
```

Per output name it writes `<name>.glb`, `<name>_sheet.png` (input + front / three-quarter / back renders),
`<name>.json` (settings, seconds, real tris, texture sizes, bounding size) and `<name>_input.*`. Stdout lists
the GLB and sheet paths. Read the sheets yourself before showing anything.

**When Command Center is running** it owns one shared 3D server for every session (its 3D view). The script then
does not run the job itself: it queues it in the app's jobs folder (`CC_MODEL3D_JOBS`, else
`%APPDATA%\command-center\model3d-jobs\`), waits, and prints the same stdout when it is done. Jobs from every
session run one at a time.
- While it waits it prints each new wait reason on stderr, e.g. `Waiting: <other job> running`,
  `Waiting: Darkfall cluster running`, `Waiting: Unity running`, `Waiting: gpu claimed by <job> since <HH:MM>`.
  Tell the user why nothing is happening; don't kill and retry.
- A failed job exits non-zero with the worker's error line; a cancelled one with "Cancelled in Command Center"
  (the user cancelled it in the 3D view). Don't resubmit a cancelled job unasked.
- Ctrl+C or a stopped session drops a job that is still queued; a running job finishes. `--no-wait` jobs are never
  dropped: they print the job id, and the models show in the 3D view (and in its job list) when done.
- `ui` asks the app for an editor turn (queued like a job) instead of starting the server; `stop` refuses with
  "The 3D server belongs to Command Center; stop it in the 3D view". The app stops the server 10 min after the
  queue empties.
- The 3D view lists the jobs with their session, progress and Cancel / Run anyway, and previews any `.glb`
  (orbit, wireframe, lit/unlit, tris, texture sizes, contact sheet). Point the user there for finished models.

**When the app is not running** (no fresh `service.json` heartbeat), the script works as before: it starts the
server itself, runs the batch and stops the server it started. `--no-wait` is ignored then.

## Budgets (set INSIDE the generation, never afterwards)

| preset | faces | maps | detail | for |
| --- | --- | --- | --- | --- |
| tiny | 1,500 | 512 | 1024 | carried items, pickups, clutter |
| prop (default) | 5,000 | 1024 | 1024 | world props, furniture, statues |
| large | 20,000 | 2048 | 1536 | big set pieces, building parts |
| hero | 60,000 | 2048 | 1536 | bosses, showcase characters |
| showcase | 300,000 | 2048 | 1536 | renders / reference only |

`--faces N` / `--tex N` / `--detail N` (1024-2048) override. Detail is the shape upsample resolution and drives
run time: the two slow stages grow with the object's surface at that resolution. A boxy chest took 842 s at 1536
and 267 s at 1024 with no visible difference at 1,500 faces; thin objects (axe, statue) are much quicker. The workflow decimates BEFORE unwrapping and baking, so detail moves into the
normal map and a 5k Pixal3D model looks close to the 700k raw one. Decimating a finished GLB in Blender tears the
UV seams - don't. A project's own budget rules (e.g. a repo memory or CLAUDE.md) beat these presets.

## Options worth knowing

- `--model pixal` (default) follows the input picture closely. `--model trellis` was worse in the 11-28 trial
  (rotated off the picture, blotchy texture); offer it only as a comparison.
- `--quality full` (default, BF16): peak ~12.4 GB VRAM. `lowvram` (INT8) saves ~5 GB; its speed here is not
  measured cleanly (the only slow INT8 run was a high-surface chest), so prefer full.
- Typical run: 1-5 min depending on object surface and detail, plus ~1-2 min model load on the first job after a
  server start; batch several items in one call.
- `--prompt` pictures are checked with the background remover: a picture showing more than one object is
  regenerated with a new seed (up to 4 tries). A supplied `--image` with several objects only gets a warning.
- `--prompt` makes an SDXL Turbo picture first (framed as a single object on plain grey). Better input = better
  model: one object, whole object in view, plain background, even light.
- `--seed`, `--steps` (default 30), `--name`, `--no-render`, `--keep-server`.

## Project defaults

A `.model3d.json` in the project root (found by walking up from the cwd) sets defaults, e.g.
`{"out": "art/generated3d", "preset": "prop", "model": "pixal", "quality": "full"}`; `out` is relative to that file.

## Safety rules

- One job on the GPU at a time. With Command Center running, the app enforces it: jobs wait while the Darkfall
  cluster (`SFGamelogic*`) or Unity runs, or while another job holds the `gpu` claim on `C:\dfst_coord\coord.py`;
  the app claims `gpu` as job `command-center-3d` while its server runs. `--force` becomes the job's Run anyway
  (skips the cluster, Unity and claim checks, never the one-job-at-a-time turn). Use it only when the user says so.
- Never stop the shared server, kill ComfyUI3D or start a second one while the app runs; the user stops it with
  Stop server in the 3D view.
- Without the app, the script refuses while the cluster or Unity runs, or while another job holds the `gpu`
  claim; it claims `gpu` itself as job `model3d` and releases it. It stops the server it started when the batch
  ends; if the server was already up (the user is in the UI), it leaves it running.
- Multi-view (turnaround sheet -> model) exists only in the UI: workflow "3D - Pixal3D multi-view (INT8)".

## Getting it into a game

GLB is the hand-off format: Unity (glTFast), Godot and Unreal import it directly. Engines with their own formats
need a project-specific converter; that belongs to the project, not to this skill. Generated art must pass the
user's own eye before it is installed anywhere.

## Engine facts

- Workflows: `C:\ComfyUI3D\user\default\workflows\` (the script drives "3D - Pixal3D or TRELLIS2 (quality BF16)"
  and rewrites steps, seeds, faces, texture/normal/AO size, model switch and quality per run).
- Server log: `C:\ComfyUI3D\server.log`. Update the engine with `git pull` in `C:\ComfyUI3D` plus
  `uv pip install --python .venv\Scripts\python.exe -r requirements.txt`; rerun one `--image` job afterwards.
- Licences: TRELLIS.2 and Pixal3D are MIT; the DINOv3 encoder and BiRefNet licences are not yet checked - say so
  before anything ships commercially.
