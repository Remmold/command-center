"""gen3d.py as a client of Command Center's 3D service, seen through the jobs folder and its own output."""
import re
import subprocess

import pytest

import gen3d


def test_submits_the_run_and_prints_the_models_when_it_is_done(app, capsys, monkeypatch):
    monkeypatch.setenv("CC_SESSION_ID", "session-7")
    app.heartbeat()
    app.script = [
        {"state": "queued"},
        {"state": "running", "startedAt": "2026-11-28T10:00:00.000Z"},
        {"state": "done", "outputs": [
            {"glb": r"C:\art\axe.glb", "sheet": r"C:\art\axe_sheet.png", "json": r"C:\art\axe.json"},
            {"glb": r"C:\art\bow.glb"},
        ]},
    ]

    gen3d.main(["--image", "axe.png", "bow.png", "--preset", "tiny"])

    req = app.request()
    assert req["kind"] == "generate"
    assert req["argv"] == ["--image", "axe.png", "bow.png", "--preset", "tiny"]
    assert req["cwd"] == str(gen3d.Path.cwd())
    assert req["python"] == gen3d.sys.executable
    assert req["script"] == str(gen3d.Path(gen3d.__file__).resolve())
    assert req["waiterPid"] == gen3d.os.getpid()
    assert req["wait"] is True
    assert req["runAnyway"] is False
    assert req["sessionId"] == "session-7"
    assert req["configDir"] == ""
    assert "axe.png" in req["summary"] and "bow.png" in req["summary"] and "tiny" in req["summary"]
    assert capsys.readouterr().out.splitlines() == [r"C:\art\axe.glb", r"C:\art\axe_sheet.png", r"C:\art\bow.glb"]


def test_prints_each_new_wait_reason_once_on_stderr(app, capsys):
    app.heartbeat()
    app.script = [
        {"state": "queued", "waitReason": "Waiting: Darkfall cluster running"},
        {"state": "queued", "waitReason": "Waiting: Darkfall cluster running"},
        {"state": "queued", "waitReason": "Waiting: gpu claimed by bake since 09:41"},
        {"state": "done", "outputs": [{"glb": r"C:\art\axe.glb"}]},
    ]

    gen3d.main(["--image", "axe.png"])

    err = capsys.readouterr().err.splitlines()
    assert [l for l in err if l.startswith("Waiting:")] == [
        "Waiting: Darkfall cluster running", "Waiting: gpu claimed by bake since 09:41"]


def test_a_failed_job_exits_non_zero_with_the_workers_error(app):
    app.heartbeat()
    app.script = [{"state": "failed", "error": "  FAILED axe: generation failed: out of memory"}]

    with pytest.raises(SystemExit) as end:
        gen3d.main(["--image", "axe.png"])

    assert end.value.code == "  FAILED axe: generation failed: out of memory"


def test_a_cancelled_job_exits_non_zero_with_cancelled_in_command_center(app):
    app.heartbeat()
    app.script = [{"state": "queued"}, {"state": "cancelled", "error": None}]

    with pytest.raises(SystemExit) as end:
        gen3d.main(["--prompt", "mossy stone gargoyle", "--count", "3"])

    assert end.value.code == "Cancelled in Command Center"
    summary = app.request()["summary"]
    assert '"mossy stone gargoyle" x3' in summary and "prop" in summary


def test_exits_non_zero_when_the_app_stops_while_it_waits_three_reads_in_a_row(app):
    app.heartbeat()
    app.script = [lambda: app.heartbeat(age_s=60), lambda: None, lambda: None]

    with pytest.raises(SystemExit) as end:
        gen3d.main(["--image", "axe.png"])

    assert "Command Center stopped" in str(end.value.code)


def test_keeps_waiting_through_stale_reads_that_are_not_three_in_a_row(app, capsys):
    def done():
        app.heartbeat()
        app.write_status(state="done", outputs=[{"glb": "C:/art/axe.glb"}])

    app.heartbeat()
    app.script = [lambda: app.heartbeat(age_s=60), lambda: None, app.heartbeat, lambda: app.heartbeat(age_s=60), lambda: None, done]

    gen3d.main(["--image", "axe.png"])

    assert capsys.readouterr().out.splitlines() == ["C:/art/axe.glb"]


def test_a_done_batch_with_failed_items_prints_its_models_and_the_failed_items_on_stderr(app, capsys):
    app.heartbeat()
    app.script = [{"state": "done", "error": "1 of 2 failed: lid: generation failed: out of memory",
                   "outputs": [{"glb": "C:/art/axe.glb"}]}]

    gen3d.main(["--image", "axe.png", "lid.png"])

    out = capsys.readouterr()
    assert out.out.splitlines() == ["C:/art/axe.glb"]
    assert "1 of 2 failed: lid: generation failed: out of memory" in out.err.splitlines()


def test_no_wait_submits_prints_the_job_id_and_returns(app, capsys):
    app.heartbeat()

    gen3d.main(["--image", "axe.png", "--no-wait"])

    req = app.request()
    assert req["wait"] is False
    assert capsys.readouterr().out.strip() == req["id"]


def test_force_asks_the_app_to_run_anyway(app):
    app.heartbeat()

    gen3d.main(["--image", "axe.png", "--force", "--no-wait"])

    assert app.request()["runAnyway"] is True


def test_the_job_id_is_a_plain_name_and_submittedAt_a_utc_time(app):
    app.heartbeat()

    gen3d.main(["--image", "axe.png", "--no-wait"])

    req = app.request()
    assert re.fullmatch(r"[A-Za-z0-9_-]{1,80}", req["id"])
    assert re.fullmatch(r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z", req["submittedAt"])
    assert not list(app.folder.glob("*.tmp"))


@pytest.mark.parametrize("service", ["stale", "dead pid", "missing", "garbled"])
def test_runs_todays_local_path_when_the_service_is_not_up(app, monkeypatch, service):
    with subprocess.Popen([gen3d.sys.executable, "-c", "pass"]) as ended:
        ended.wait()  # the handle stays open until the with ends, so the pid cannot be reused meanwhile
        if service == "stale":
            app.heartbeat(age_s=gen3d.HEARTBEAT_MAX_AGE_S + 1)
        elif service == "dead pid":
            app.heartbeat(pid=ended.pid)
        elif service == "garbled":
            (app.folder / "service.json").write_text("{not json", encoding="utf-8")

        def refuse(force):
            raise SystemExit("refusing: Unity.exe running (RAM/VRAM). Stop it or pass --force.")
        monkeypatch.setattr(gen3d, "preflight", refuse)

        with pytest.raises(SystemExit) as end:
            gen3d.main(["--image", "axe.png"])

    assert str(end.value.code).startswith("refusing:")
    assert not list(app.folder.glob("*.request.json"))


def test_a_fresh_heartbeat_from_a_live_pid_counts_as_up(app):
    app.heartbeat(age_s=gen3d.HEARTBEAT_MAX_AGE_S - 5)

    assert gen3d.live_service() == app.folder


def test_the_jobs_folder_defaults_to_command_centers_app_data(monkeypatch, tmp_path):
    monkeypatch.delenv("CC_MODEL3D_JOBS")
    monkeypatch.setenv("APPDATA", str(tmp_path))

    assert gen3d.jobs_folder() == tmp_path / "command-center" / "model3d-jobs"


def test_stop_refuses_while_the_service_is_up(app):
    app.heartbeat()

    with pytest.raises(SystemExit) as end:
        gen3d.main(["stop"])

    assert end.value.code == "The 3D server belongs to Command Center; stop it in the 3D view"
    assert not list(app.folder.glob("*.request.json"))


def test_stop_stops_the_server_itself_when_the_app_is_not_running(app, monkeypatch):
    stopped = []
    monkeypatch.setattr(gen3d, "stop_server", lambda: stopped.append(True))

    gen3d.main(["stop"])

    assert stopped == [True]


def test_ui_requests_an_editor_turn_without_waiting(app, monkeypatch):
    app.heartbeat()
    monkeypatch.setattr(gen3d.webbrowser, "open", lambda url: pytest.fail("opened the browser itself"))

    gen3d.main(["ui"])

    req = app.request()
    assert req["kind"] == "editor"
    assert req["argv"] == ["ui"]
    assert req["wait"] is False


def test_a_service_json_the_app_is_replacing_is_read_again_before_falling_back(app, monkeypatch):
    app.heartbeat()
    real_read = gen3d.Path.read_text
    refusals = []

    def busy_once(path, *a, **k):
        if path.name == "service.json" and not refusals:
            refusals.append(path)
            raise PermissionError(32, "The process cannot access the file because it is being used by another process")
        return real_read(path, *a, **k)

    monkeypatch.setattr(gen3d.Path, "read_text", busy_once)

    assert gen3d.live_service() == app.folder
    assert len(refusals) == 1
