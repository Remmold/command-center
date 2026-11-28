"""gen3d.py --service-worker: what Command Center's worker runner reads from it."""
import json

import gen3d


def test_worker_runs_no_guards_or_server_and_reports_each_stage(monkeypatch, capsys, tmp_path):
    monkeypatch.setenv("CC_MODEL3D_CLIENT_ID", "app-client-1")
    calls = []
    client_ids = []

    def fake_http(path, body=None, timeout=30):
        calls.append(path)
        if path == "/prompt":
            client_ids.append(body["client_id"])
            return {"prompt_id": "p1"}
        if path.startswith("/history/"):
            return {"p1": {"status": {"status_str": "success"}, "outputs": {}}}
        return {}

    def fake_text_to_image(prompt, seed, dest):
        gen3d.queue({})
        dest.write_bytes(b"png")

    def fake_generate(a, image, name, out, stage):
        stage("render")
        glb = out / f"{name}.glb"
        glb.write_bytes(b"glb")
        (out / f"{name}_sheet.png").write_bytes(b"png")
        return {"glb": str(glb), "seconds": 3, "tris": 1500}

    monkeypatch.setattr(gen3d, "http", fake_http)
    monkeypatch.setattr(gen3d, "count_objects", lambda image: 1)
    monkeypatch.setattr(gen3d, "text_to_image", fake_text_to_image)
    monkeypatch.setattr(gen3d, "generate", fake_generate)
    out = tmp_path / "out"

    gen3d.main(["--prompt", "iron chest", "--count", "2", "--out", str(out), "--no-wait", "--service-worker"])

    cap = capsys.readouterr()
    markers = [json.loads(l[len("@@model3d "):]) for l in cap.err.splitlines() if l.startswith("@@model3d ")]
    assert [(m["item"], m["of"], m["name"], m["stage"]) for m in markers] == [
        (1, 2, "iron_chest_1", "picture"), (1, 2, "iron_chest_1", "mask"),
        (1, 2, "iron_chest_1", "generate"), (1, 2, "iron_chest_1", "render"),
        (2, 2, "iron_chest_2", "picture"), (2, 2, "iron_chest_2", "mask"),
        (2, 2, "iron_chest_2", "generate"), (2, 2, "iron_chest_2", "render"),
    ]
    assert cap.out.splitlines() == [str(out / "iron_chest_1.glb"), str(out / "iron_chest_1_sheet.png"),
                                    str(out / "iron_chest_2.glb"), str(out / "iron_chest_2_sheet.png")]
    assert calls.count("/free") == 2
    assert client_ids == ["app-client-1", "app-client-1"]


def test_worker_ignores_a_live_service_and_never_submits(monkeypatch, capsys, tmp_path, no_real_engine):
    monkeypatch.setattr(gen3d, "service_live", lambda folder: True)
    monkeypatch.setattr(gen3d, "http", lambda *a, **k: {})
    monkeypatch.setattr(gen3d, "count_objects", lambda image: 1)
    monkeypatch.setattr(gen3d, "generate", lambda a, image, name, out, stage: {"glb": str(out / "axe.glb"), "seconds": 1})
    picture = tmp_path / "axe.png"
    picture.write_bytes(b"png")
    out = tmp_path / "out"

    gen3d.main(["--image", str(picture), "--out", str(out), "--service-worker"])

    assert not list(no_real_engine.glob("*.request.json"))
    assert capsys.readouterr().out.splitlines() == [str(out / "axe.glb")]
