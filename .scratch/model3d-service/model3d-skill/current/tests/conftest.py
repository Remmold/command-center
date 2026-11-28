import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

import gen3d  # noqa: E402


def iso(at):
    return at.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


class FakeApp:
    """Command Center's side of the jobs folder: service.json, and a status per poll from a script."""

    def __init__(self, folder):
        self.folder = folder
        self.script = []
        self.requests = []

    def heartbeat(self, age_s=0.0, pid=None):
        at = datetime.now(timezone.utc) - timedelta(seconds=age_s)
        body = {"pid": pid or gen3d.os.getpid(), "heartbeatAt": iso(at), "server": "ready", "startedByApp": True}
        (self.folder / "service.json").write_text(json.dumps(body), encoding="utf-8")

    def request(self):
        files = sorted(self.folder.glob("*.request.json"))
        assert len(files) == 1, files
        return json.loads(files[0].read_text(encoding="utf-8"))

    def write_status(self, **status):
        body = {"state": "queued", "waitReason": None, "progress": None, "startedAt": None, "endedAt": None,
                "error": None, "outputs": [], **status}
        (self.folder / f"{self.request()['id']}.status.json").write_text(json.dumps(body), encoding="utf-8")

    def poll(self):
        """Stands in for gen3d.py's 2 s pause: the app moves the job one step on."""
        assert self.script, "gen3d.py polled again after the last status"
        step = self.script.pop(0)
        if callable(step):
            step()
        else:
            self.write_status(**step)


@pytest.fixture(autouse=True)
def no_real_engine(monkeypatch, tmp_path):
    """No test may reach the real ComfyUI3D server, coord board or jobs folder."""
    def forbidden(name):
        def fail(*a, **k):
            raise AssertionError(f"{name} touched the real engine")
        return fail

    for name in ("http", "server_up", "start_server", "stop_server", "preflight", "coord", "render_sheet"):
        monkeypatch.setattr(gen3d, name, forbidden(name))
    monkeypatch.setattr(gen3d, "CLIENT_ID", None)
    jobs = tmp_path / "jobs"
    jobs.mkdir()
    monkeypatch.setenv("CC_MODEL3D_JOBS", str(jobs))
    monkeypatch.delenv("CC_SESSION_ID", raising=False)
    monkeypatch.delenv("CLAUDE_CONFIG_DIR", raising=False)
    monkeypatch.delenv("CC_MODEL3D_CLIENT_ID", raising=False)
    work = tmp_path / "work"
    work.mkdir()
    monkeypatch.chdir(work)
    return jobs


@pytest.fixture
def app(no_real_engine, monkeypatch):
    fake = FakeApp(no_real_engine)
    monkeypatch.setattr(gen3d, "pause", fake.poll)
    return fake
