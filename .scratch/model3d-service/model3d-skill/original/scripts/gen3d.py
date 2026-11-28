"""Image (or text prompt) -> textured, game-budgeted GLB with local Pixal3D / TRELLIS.2 on ComfyUI.

    python gen3d.py --image axe.png --preset prop --out ./art/3d
    python gen3d.py --image ./concepts/ --preset large             (every picture in the folder)
    python gen3d.py --prompt "mossy stone gargoyle statue" --count 3 --preset prop
    python gen3d.py ui                                             (open the visual workflow editor)
    python gen3d.py stop                                           (stop the server)

Project defaults come from the nearest .model3d.json above the current directory, e.g.
    {"out": "art/generated3d", "preset": "prop", "model": "pixal", "quality": "full"}
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
import uuid
import webbrowser
from pathlib import Path

ENGINE = Path(r"C:\ComfyUI3D")
PY = ENGINE / ".venv" / "Scripts" / "python.exe"
PORT = 8189
URL = f"http://127.0.0.1:{PORT}"
WORKFLOW = ENGINE / "user" / "default" / "workflows" / "3D - Pixal3D or TRELLIS2 (quality BF16).json"
BLENDER = Path(r"C:\Program Files\Blender Foundation\Blender 5.1\blender.exe")
COORD = Path(r"C:\dfst_coord\coord.py")
HERE = Path(__file__).resolve().parent
RAM_HEAVY = ("SFGamelogicServer.exe", "SFGamelogicDistributor.exe", "Unity.exe")

# faces, colour-map size, shape detail (upsample resolution); normal map follows the colour map, AO caps at 1024.
# Detail drives the slow stages: their cost grows with the object's surface at that resolution (a boxy chest
# took 13 min at 1536), and a low-poly target cannot keep 1536 detail anyway.
PRESETS = {
    "tiny": (1500, 512, 1024),        # carried items, pickups, small clutter
    "prop": (5000, 1024, 1024),       # world props, furniture, statues
    "large": (20000, 2048, 1536),     # building parts, big set pieces
    "hero": (60000, 2048, 1536),      # bosses, showcase characters
    "showcase": (300000, 2048, 1536), # renders / reference, not for real-time
}
SKIP = {"Note", "MarkdownNote", "Reroute"}
WIDGET_TYPES = {"INT", "FLOAT", "STRING", "BOOLEAN", "COMBO"}
PICTURE_TRIES = 4
PROMPT_FRAME = "single centered object, full object in view, plain light grey background, soft studio lighting, game asset, "


def log(*a):
    print(*a, file=sys.stderr, flush=True)


def http(path, body=None, timeout=30):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(URL + path, data, {"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        raw = r.read()
    return json.loads(raw) if raw.strip() else {}


def server_up():
    try:
        urllib.request.urlopen(URL + "/system_stats", timeout=2)
        return True
    except (urllib.error.URLError, OSError):
        return False


def start_server():
    log("starting ComfyUI3D on port", PORT)
    logf = open(ENGINE / "server.log", "w", encoding="utf-8")
    subprocess.Popen([str(PY), "main.py", "--port", str(PORT)], cwd=ENGINE, stdout=logf, stderr=subprocess.STDOUT,
                     creationflags=subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.DETACHED_PROCESS)
    for _ in range(120):
        if server_up():
            return
        time.sleep(1)
    sys.exit(f"server did not come up; see {ENGINE / 'server.log'}")


def stop_server():
    out = subprocess.run(["netstat", "-ano"], capture_output=True, text=True).stdout
    pids = {l.split()[-1] for l in out.splitlines() if f"127.0.0.1:{PORT} " in l and "LISTENING" in l}
    for pid in pids:
        subprocess.run(["taskkill", "/PID", pid, "/F"], capture_output=True)
    log("server stopped" if pids else "server was not running")


def preflight(force):
    if force:
        return
    tasks = subprocess.run(["tasklist"], capture_output=True, text=True).stdout
    busy = [p for p in RAM_HEAVY if p in tasks]
    if busy:
        sys.exit(f"refusing: {', '.join(busy)} running (RAM/VRAM). Stop it or pass --force.")
    if COORD.exists():
        claims = subprocess.run([sys.executable, "-I", str(COORD), "claims", "gpu"], capture_output=True, text=True).stdout
        others = [l for l in claims.splitlines() if '"path": "gpu"' in l and '"job": "model3d"' not in l]
        if others:
            sys.exit("refusing: GPU claimed on the coord board:\n" + "\n".join(others) + "\npass --force to ignore.")


def coord(cmd):
    if COORD.exists():
        args = [cmd, "model3d", "gpu"] + (["gen3d.py run"] if cmd == "claim" else [])
        subprocess.run([sys.executable, "-I", str(COORD), *args], capture_output=True)


def is_widget(spec):
    return isinstance(spec[0], list) or spec[0] in WIDGET_TYPES


def to_api(ui, info):
    """UI-format workflow -> API prompt, mapping widgets_values onto the node schemas."""
    links = {l[0]: l for l in ui["links"]}
    api = {}
    for n in ui["nodes"]:
        if n["type"] in SKIP or n.get("mode", 0) in (2, 4):
            continue
        schema = info[n["type"]]["input"]
        order = info[n["type"]].get("input_order") or {k: list(schema.get(k, {})) for k in ("required", "optional")}
        specs = {**schema.get("required", {}), **schema.get("optional", {})}
        wv = list(n["widgets_values"]) if isinstance(n.get("widgets_values"), list) else []
        linked = {i["name"]: links[i["link"]] for i in n.get("inputs", []) if i.get("link") is not None}
        sockets = {i["name"] for i in n.get("inputs", []) if not i.get("widget")}
        inputs = {}

        def fill(name, spec):
            opts = spec[1] if len(spec) > 1 and isinstance(spec[1], dict) else {}
            if (name not in sockets or is_widget(spec)) and wv:
                inputs[name] = wv.pop(0)
                if opts.get("control_after_generate") and wv and wv[0] in ("fixed", "randomize", "increment", "decrement"):
                    wv.pop(0)
            if name in linked:
                inputs[name] = [str(linked[name][1]), linked[name][2]]
            if spec[0] == "COMFY_DYNAMICCOMBO_V3":
                # the chosen option's own inputs follow it in widgets_values, keyed "<combo>.<input>"
                chosen = next(o for o in opts["options"] if o["key"] == inputs[name])
                for group in ("required", "optional"):
                    for sub, sub_spec in chosen["inputs"].get(group, {}).items():
                        fill(f"{name}.{sub}", sub_spec)

        for name in order.get("required", []) + order.get("optional", []):
            fill(name, specs[name])
        api[str(n["id"])] = {"class_type": n["type"], "inputs": inputs}
    return api


def queue(api):
    resp = http("/prompt", {"prompt": api, "client_id": uuid.uuid4().hex})
    for nid, err in resp.get("node_errors", {}).items():
        log("INVALID", nid, err.get("class_type"), [e.get("details") for e in err.get("errors", [])])
    pid, t0 = resp["prompt_id"], time.time()
    while True:
        h = http(f"/history/{pid}")
        if pid in h:
            st = h[pid]["status"]
            if st.get("status_str") != "success":
                msgs = [m[1].get("exception_message", "") for m in st.get("messages", []) if m[0] == "execution_error"]
                raise RuntimeError("generation failed: " + " | ".join(msgs))
            return h[pid]["outputs"], time.time() - t0
        time.sleep(2)


def text_to_image(prompt, seed, dest):
    api = {
        "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": "DreamShaperXL_Turbo_v2_1.safetensors"}},
        "2": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["1", 1], "text": PROMPT_FRAME + prompt}},
        "3": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["1", 1], "text": "blurry, cropped, cut off, text, watermark, multiple objects, busy background"}},
        "4": {"class_type": "EmptyLatentImage", "inputs": {"width": 1024, "height": 1024, "batch_size": 1}},
        "5": {"class_type": "KSampler", "inputs": {"model": ["1", 0], "positive": ["2", 0], "negative": ["3", 0], "latent_image": ["4", 0],
                                                    "seed": seed, "steps": 7, "cfg": 2.0, "sampler_name": "dpmpp_sde", "scheduler": "karras", "denoise": 1.0}},
        "6": {"class_type": "VAEDecode", "inputs": {"samples": ["5", 0], "vae": ["1", 2]}},
        "7": {"class_type": "SaveImage", "inputs": {"images": ["6", 0], "filename_prefix": "gen3d_input"}},
    }
    outputs, _ = queue(api)
    img = outputs["7"]["images"][0]
    shutil.move(str(ENGINE / "output" / img["subfolder"] / img["filename"]), dest)


def count_objects(image):
    """Large separate shapes in the BiRefNet foreground mask (the same remover the 3D workflow uses)."""
    import numpy as np
    from PIL import Image
    from scipy import ndimage

    staged = ENGINE / "input" / f"gen3d_chk_{uuid.uuid4().hex[:8]}{Path(image).suffix}"
    shutil.copy(image, staged)
    api = {
        "1": {"class_type": "LoadImage", "inputs": {"image": staged.name}},
        "2": {"class_type": "LoadBackgroundRemovalModel", "inputs": {"bg_removal_name": "birefnet.safetensors"}},
        "3": {"class_type": "RemoveBackground", "inputs": {"bg_removal_model": ["2", 0], "image": ["1", 0]}},
        "4": {"class_type": "MaskToImage", "inputs": {"mask": ["3", 0]}},
        "5": {"class_type": "SaveImage", "inputs": {"images": ["4", 0], "filename_prefix": "gen3d_mask"}},
    }
    try:
        outputs, _ = queue(api)
    finally:
        staged.unlink(missing_ok=True)
    m = outputs["5"]["images"][0]
    mask_path = ENGINE / "output" / m["subfolder"] / m["filename"]
    mask = np.asarray(Image.open(mask_path).convert("L")) > 127
    mask_path.unlink(missing_ok=True)
    labels, n = ndimage.label(mask)
    if n == 0:
        return 0
    areas = np.bincount(labels.ravel())[1:]
    # ignore specks and loose bits: a second object must be sizeable next to the main one
    return int(np.sum(areas >= max(0.15 * areas.max(), 0.005 * mask.size)))


def build_ui(a):
    ui = json.loads(WORKFLOW.read_text(encoding="utf-8"))
    for n in ui["nodes"]:
        w = n.get("widgets_values")
        t = n["type"]
        if t == "KSampler":
            w[2] = a.steps
            w[0] = a.seed + int(n["id"])
        elif t == "PrimitiveInt" and n.get("title") == "Texture Resolution":
            w[0] = a.tex
        elif t == "BakeNormalMapFromMesh":
            w[0] = a.tex
        elif t == "BakeAmbientOcclusion":
            w[0] = min(a.tex, 1024)
        elif t == "DecimateMesh":
            w[0] = a.faces
        elif t == "Trellis2UpsampleStage":
            w[0] = a.detail
        elif t == "UNETLoader":
            w[0] = w[0].replace("_bf16", "_int8_convrot") if a.quality == "lowvram" else w[0]
        elif t == "PrimitiveBoolean":
            w[0] = a.model == "trellis"
        elif t == "Save3DAdvanced":
            w[0] = "gen3d/" + uuid.uuid4().hex[:8]
    return ui


def render_sheet(glb, image, out_png):
    if not BLENDER.exists():
        return {}
    shots = out_png.parent / (out_png.stem + "_views")
    r = subprocess.run([str(BLENDER), "-b", "--factory-startup", "--python", str(HERE / "render_glb.py"), "--", str(glb), str(shots)],
                       capture_output=True, text=True)
    stats = {}
    for line in r.stdout.splitlines():
        if line.startswith("STAT "):
            k, v = line[5:].split(" ", 1)
            stats[k] = json.loads(v)
    if (shots / "front.png").exists():
        subprocess.run([sys.executable, "-I", str(HERE / "sheet.py"), str(image), str(shots), str(out_png)], capture_output=True)
        shutil.rmtree(shots, ignore_errors=True)
    return stats


def generate(a, image, name, out):
    ui = build_ui(a)
    api = to_api(ui, http("/object_info", timeout=60))
    staged = ENGINE / "input" / f"gen3d_{uuid.uuid4().hex[:8]}{Path(image).suffix}"
    shutil.copy(image, staged)
    for node in api.values():
        if node["class_type"] == "LoadImage":
            node["inputs"]["image"] = staged.name
    outputs, secs = queue(api)
    staged.unlink(missing_ok=True)
    saved = next(f for o in outputs.values() for f in o.get("3d", []) if f.get("type") == "output")
    glb = out / f"{name}.glb"
    shutil.move(str(ENGINE / "output" / saved["subfolder"] / saved["filename"]), glb)
    if Path(image).resolve() != (out / f"{name}_input.png").resolve():
        shutil.copy(image, out / f"{name}_input{Path(image).suffix}")
    stats = {} if a.no_render else render_sheet(glb, image, out / f"{name}_sheet.png")
    meta = {"glb": str(glb), "source": str(image), "model": a.model, "quality": a.quality, "preset": a.preset,
            "faces_target": a.faces, "texture": a.tex, "detail": a.detail, "steps": a.steps, "seed": a.seed, "seconds": round(secs), **stats}
    (out / f"{name}.json").write_text(json.dumps(meta, indent=1), encoding="utf-8")
    return meta


def project_config():
    for d in [Path.cwd(), *Path.cwd().parents]:
        f = d / ".model3d.json"
        if f.exists():
            cfg = json.loads(f.read_text(encoding="utf-8"))
            if "out" in cfg and not Path(cfg["out"]).is_absolute():
                cfg["out"] = str(d / cfg["out"])
            log("project config:", f)
            return cfg
    return {}


def main():
    if len(sys.argv) > 1 and sys.argv[1] in ("ui", "stop"):
        if sys.argv[1] == "stop":
            return stop_server()
        if not server_up():
            preflight("--force" in sys.argv)
            start_server()
        webbrowser.open(URL)
        log(f"UI at {URL}; workflows are in the left Workflows sidebar. Run 'gen3d.py stop' when done.")
        return

    cfg = project_config()
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--image", nargs="+", help="picture(s) or folder(s) of pictures, one object on a plain background")
    src.add_argument("--prompt", help="text; an SDXL picture is generated first, then turned into 3D")
    ap.add_argument("--count", type=int, default=1, help="variants per prompt (different seeds)")
    ap.add_argument("--model", choices=["pixal", "trellis"], default=cfg.get("model", "pixal"))
    ap.add_argument("--quality", choices=["full", "lowvram"], default=cfg.get("quality", "full"),
                    help="full = BF16 (default); lowvram = INT8, ~5 GB less VRAM")
    ap.add_argument("--preset", choices=list(PRESETS), default=cfg.get("preset", "prop"))
    ap.add_argument("--faces", type=int, help="override the preset's face count")
    ap.add_argument("--tex", type=int, choices=[512, 1024, 2048, 4096], help="override the preset's texture size")
    ap.add_argument("--detail", type=int, choices=range(1024, 2049, 128), metavar="1024-2048",
                    help="override the preset's shape detail; higher is slower, worth it only for high face counts")
    ap.add_argument("--steps", type=int, default=cfg.get("steps", 30))
    ap.add_argument("--seed", type=int, default=cfg.get("seed", 42))
    ap.add_argument("--name", help="output base name (default: picture name / prompt slug)")
    ap.add_argument("--out", default=cfg.get("out", "generated3d"))
    ap.add_argument("--no-render", action="store_true", help="skip the Blender contact sheet")
    ap.add_argument("--keep-server", action="store_true")
    ap.add_argument("--force", action="store_true", help="ignore the RAM/GPU busy guards")
    a = ap.parse_args()
    a.faces = a.faces or cfg.get("faces") or PRESETS[a.preset][0]
    a.tex = a.tex or cfg.get("tex") or PRESETS[a.preset][1]
    a.detail = a.detail or cfg.get("detail") or PRESETS[a.preset][2]
    out = Path(a.out).resolve()
    out.mkdir(parents=True, exist_ok=True)

    jobs = []
    if a.image:
        for p in map(Path, a.image):
            files = sorted(f for f in p.iterdir() if f.suffix.lower() in (".png", ".jpg", ".jpeg", ".webp")) if p.is_dir() else [p]
            jobs += [(f, a.name if a.name and len(a.image) == 1 and not p.is_dir() else f.stem) for f in files]
    else:
        slug = a.name or "_".join(a.prompt.lower().split()[:4]).replace(",", "")
        jobs = [(None, f"{slug}_{i + 1}" if a.count > 1 else slug) for i in range(a.count)]

    preflight(a.force)
    was_up = server_up()
    coord("claim")
    try:
        if not was_up:
            start_server()
        base_seed = a.seed
        for i, (image, name) in enumerate(jobs):
            a.seed = base_seed + i
            if image is None:
                image = out / f"{name}_input.png"
                for _ in range(PICTURE_TRIES):
                    text_to_image(a.prompt, a.seed, image)
                    found = count_objects(image)
                    if found == 1:
                        break
                    log(f"  picture seed {a.seed} has {found} objects, regenerating")
                    a.seed += 1000
                else:
                    log(f"  SKIPPED {name}: no single-object picture in {PICTURE_TRIES} tries; last one kept at {image}")
                    continue
            elif (found := count_objects(image)) != 1:
                log(f"  WARNING {name}: picture shows {found} separate objects; the model will contain all of them")
            # leave the full VRAM to the 11 GB 3D model
            http("/free", {"unload_models": True, "free_memory": True})
            log(f"[{i + 1}/{len(jobs)}] {name}: {a.model}/{a.quality}, {a.faces} faces, {a.tex}px, detail {a.detail}")
            try:
                meta = generate(a, image, name, out)
            except Exception as e:  # keep going with the rest of a batch
                log(f"  FAILED {name}: {e}")
                continue
            log(f"  {meta.get('tris', '?')} tris, {meta['seconds']} s")
            print(meta["glb"])
            if (out / f"{name}_sheet.png").exists():
                print(out / f"{name}_sheet.png")
    finally:
        if not was_up and not a.keep_server:
            stop_server()
        coord("unclaim")


if __name__ == "__main__":
    main()
