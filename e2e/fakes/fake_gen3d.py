"""A fake gen3d.py worker for the e2e suite, named as `script` in a dropped request.

Prints gen3d.py's `@@model3d` progress markers on stderr, queues fake prompts on the fake ComfyUI under
CC_MODEL3D_CLIENT_ID until the `--hold` file exists, then copies the fixture GLB, sheet and .json into --out
and prints their paths on stdout as gen3d.py does.
"""
import argparse
import json
import os
import shutil
import sys
import time
import urllib.request
from pathlib import Path

FIXTURE = Path(__file__).resolve().parent / "fixture"

ap = argparse.ArgumentParser()
ap.add_argument("--image", nargs="+", default=["model.png"])
ap.add_argument("--name", default="model")
ap.add_argument("--out", default="generated3d")
ap.add_argument("--comfy-port", type=int, required=True)
ap.add_argument("--hold", help="runs until this file exists")
a, _ = ap.parse_known_args()


def log(*parts):
    print(*parts, file=sys.stderr, flush=True)


def queue_prompt():
    body = json.dumps({"client_id": os.environ.get("CC_MODEL3D_CLIENT_ID", ""), "prompt": {}}).encode()
    req = urllib.request.Request(f"http://127.0.0.1:{a.comfy_port}/prompt", body, {"Content-Type": "application/json"})
    urllib.request.urlopen(req, timeout=5).read()


log("@@model3d " + json.dumps({"item": 1, "of": 1, "name": a.name, "stage": "mask"}))
log("@@model3d " + json.dumps({"item": 1, "of": 1, "name": a.name, "stage": "generate"}))
while a.hold and not Path(a.hold).exists():
    queue_prompt()
    time.sleep(0.2)

out = Path(a.out).resolve()
out.mkdir(parents=True, exist_ok=True)
glb = out / f"{a.name}.glb"
shutil.copy(FIXTURE / "model.glb", glb)
shutil.copy(FIXTURE / "model_sheet.png", out / f"{a.name}_sheet.png")
meta = json.loads((FIXTURE / "model.json").read_text(encoding="utf-8"))
(out / f"{a.name}.json").write_text(json.dumps({"glb": str(glb), **meta}, indent=1), encoding="utf-8")
log(f"  {meta['tris']} tris, {meta['seconds']} s")
print(glb, flush=True)
print(out / f"{a.name}_sheet.png", flush=True)
