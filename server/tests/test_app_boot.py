"""The API must start on a machine that has never built the dashboard.

Found by CI on its first run. `app/main.py` mounted the dashboard build directory at
import time, so on a clean checkout -- a new server, a fresh clone, a CI runner -- the
whole application raised `RuntimeError: Directory '.../server/dashboard' does not exist`
before a single route existed. Every patient call and every acknowledgement depended on a
front-end build having been run first.

This had been true for a long time and was invisible, because the one machine that ran
this code had the directory sitting there from an earlier deploy.
"""

from pathlib import Path

from app.main import DASHBOARD_DIR, STATIC_DIR, app


def test_the_api_answers_without_a_dashboard_build(client, make_clinic):
    """The alerting path works regardless of what the front end looks like."""
    c = make_clinic()
    res = client.post(
        "/api/v1/calls",
        json={"device_id": c["device_id"], "ev1527_code": c["ev1527_code"]},
        headers={"X-Device-Key": c["device_key"]},
    )
    assert res.status_code == 201, res.text


def test_importing_the_app_does_not_require_build_output():
    """Delete the build directory and import again -- the real shape of the failure.

    Monkeypatching the module's path constants would prove nothing: reloading re-runs
    the module body, which recomputes both paths from __file__ and ignores whatever was
    patched. The only honest version of this test is to actually take the directory
    away, which is the state every fresh checkout is in.

    A developer machine usually has a build sitting there and CI never does, so the
    directory is moved aside and put back rather than skipped on one of the two -- a
    test that only runs where the bug cannot happen is not a test.
    """
    import importlib
    import shutil

    from app import main

    stashed = DASHBOARD_DIR.with_name(DASHBOARD_DIR.name + ".test-stash")
    shutil.rmtree(stashed, ignore_errors=True)
    had_build = DASHBOARD_DIR.exists()
    if had_build:
        DASHBOARD_DIR.rename(stashed)

    try:
        assert not DASHBOARD_DIR.exists()
        reloaded = importlib.reload(main)
        assert reloaded.app is not None
        assert reloaded.DASHBOARD_DIR.is_dir(), "import katalogni qayta yaratmadi"
    finally:
        if had_build:
            shutil.rmtree(DASHBOARD_DIR, ignore_errors=True)
            stashed.rename(DASHBOARD_DIR)
        importlib.reload(main)


def test_the_dashboard_directory_is_not_tracked_in_git():
    """It is build output. A committed copy goes stale and then lies about production.

    The copy in git was from 3 September while production ran a build from weeks later;
    rebuilding from source reproduced production's hashes exactly, so the source was
    fine and only the committed artifact was wrong.
    """
    repo = Path(__file__).resolve().parents[2]
    gitignore = (repo / ".gitignore").read_text()
    assert "server/dashboard/" in gitignore


def test_both_served_directories_exist_after_import():
    assert STATIC_DIR.is_dir()
    assert DASHBOARD_DIR.is_dir()
    assert app is not None
