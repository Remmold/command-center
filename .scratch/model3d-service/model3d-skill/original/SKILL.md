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
python .../gen3d.py ui                                        # visual editor in the browser (user tweaks live)
python .../gen3d.py stop
```

Per output name it writes `<name>.glb`, `<name>_sheet.png` (input + front / three-quarter / back renders),
`<name>.json` (settings, seconds, real tris, texture sizes, bounding size) and `<name>_input.*`. Stdout lists
the GLB and sheet paths. Read the sheets yourself before showing anything.

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

- The script refuses while the Darkfall cluster (`SFGamelogic*`) or Unity runs, or while another job holds the
  `gpu` claim on `C:\dfst_coord\coord.py`; it claims `gpu` itself as job `model3d` and releases it. `--force` only
  when the user says so.
- It stops the server it started when the batch ends. If the server was already up (the user is in the UI), it
  leaves it running.
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
