"""Test fixtures: a real Postgres, a real app, a real HTTP client.

A real database rather than SQLite or a mock. Almost everything these tests are here to
protect is Postgres-specific -- native enum types, ON CONFLICT on a named constraint, the
atomic UPDATE ... WHERE that keeps two nurses from acknowledging the same call -- and a
test that swaps those out for an in-memory stand-in proves the stand-in works.

The database URL has to be in the environment before app.core.config is imported, because
the engine is built at import time from DATABASE_URL. Hence the setup at the top of this
file, above every app import.

    cd server && .venv/bin/python -m pytest
"""

import os
import subprocess
import sys
import uuid
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

TEST_DB = os.getenv("TEST_DB_NAME", "nursecall_test")
PG_ADMIN_URL = os.getenv("TEST_PG_ADMIN_URL", "postgresql://localhost/postgres")


def _recreate_database() -> str:
    """Drop and recreate the test database, returning its SQLAlchemy URL.

    Recreated per run, not per test: creating a database is slow, and anything that
    leaks between tests is caught instead by each test owning its own clinic.

    The connection details come from TEST_PG_ADMIN_URL and nowhere else, so a laptop
    (a bare `postgresql://localhost/postgres`) and CI (a container with a user and
    password) are the same code path with one variable changed.
    """
    for sql in (f'DROP DATABASE IF EXISTS "{TEST_DB}"', f'CREATE DATABASE "{TEST_DB}"'):
        subprocess.run(["psql", PG_ADMIN_URL, "-q", "-c", sql], check=True, capture_output=True)

    parts = urlsplit(PG_ADMIN_URL)
    return urlunsplit(("postgresql+psycopg", parts.netloc, f"/{TEST_DB}", "", ""))


os.environ["DATABASE_URL"] = _recreate_database()
# Fixed so a token minted in one test is readable in another, and so the rotation test
# has something known to rotate away from.
os.environ.setdefault("JWT_SECRET", "test-secret-not-a-real-one")
# Push and alerting must never be attempted from a test run.
os.environ["FCM_SERVICE_ACCOUNT_FILE"] = ""
os.environ["NTFY_TOPIC_URL"] = ""
os.environ["TELEGRAM_BOT_TOKEN"] = ""
# Exercise the same schema path as deployment, before importing the app.
subprocess.run(
    [sys.executable, "-m", "alembic", "upgrade", "head"],
    cwd=Path(__file__).resolve().parents[1],
    check=True,
    capture_output=True,
)

from fastapi.testclient import TestClient  # noqa: E402

from app.core.security import hash_password, hash_secret  # noqa: E402
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.enums import StaffRole, SubscriptionStatus  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Button, Clinic, Device, Room, Staff  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def schema():
    # Migrated before app import above, matching production schema and FK behavior.
    yield
    Base.metadata.drop_all(engine)


@pytest.fixture
def db():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.rollback()
        session.close()


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def make_clinic(db):
    """A whole working clinic: the clinic, a nurse, an admin, a room, a receiver.

    Every test builds its own, with unique emails, so two tests can never see each
    other's rows -- which is exactly the property most of these tests are asserting
    about two clinics, and it would be odd to rely on shared state to check it.
    """

    def _make(
        *,
        name: str | None = None,
        subscription_status: SubscriptionStatus = SubscriptionStatus.ACTIVE,
        paid_until=None,
        enforcement_enabled: bool = True,
        floor: int = 1,
        room_number: str = "101",
        ev1527_code: int = 1234567,
    ):
        tag = uuid.uuid4().hex[:8]
        clinic = Clinic(
            name=name or f"Klinika {tag}",
            subscription_status=subscription_status,
            paid_until=paid_until,
            enforcement_enabled=enforcement_enabled,
        )
        db.add(clinic)
        db.flush()

        nurse = Staff(
            clinic_id=clinic.id,
            email=f"nurse-{tag}@test.uz",
            password_hash=hash_password("parol123"),
            role=StaffRole.NURSE,
            name=f"Hamshira {tag}",
        )
        admin = Staff(
            clinic_id=clinic.id,
            email=f"admin-{tag}@test.uz",
            password_hash=hash_password("parol123"),
            role=StaffRole.ADMIN,
            name=f"Admin {tag}",
        )
        room = Room(clinic_id=clinic.id, room_number=room_number, floor=floor)
        db.add_all([nurse, admin, room])
        db.flush()

        device_key = f"dk_test_{tag}"
        device = Device(
            clinic_id=clinic.id,
            device_id=f"esp32-{tag}",
            device_api_key_hash=hash_secret(device_key),
            floor=floor,
        )
        db.add(device)
        db.flush()

        # A paired button, so a test can press it the way a patient does. The EV1527
        # code is unique per clinic, which is the whole point of the pairing: two
        # clinics may own buttons with the same code and must never cross.
        button = Button(clinic_id=clinic.id, room_id=room.id, ev1527_code=ev1527_code)
        db.add(button)
        db.commit()

        return {
            "clinic": clinic,
            "nurse": nurse,
            "admin": admin,
            "room": room,
            "device": device,
            "device_id": device.device_id,
            "device_key": device_key,
            "button": button,
            "ev1527_code": ev1527_code,
            "password": "parol123",
        }

    return _make


@pytest.fixture
def login(client):
    """Signs in over HTTP and returns an Authorization header.

    Deliberately goes through the real login route rather than minting a token
    directly: if login ever stops issuing a token these routes accept, that is itself
    the bug, and a hand-made token would hide it.
    """

    def _login(staff: Staff, password: str = "parol123") -> dict[str, str]:
        res = client.post(
            "/api/v1/auth/login",
            json={"email": staff.email, "password": password},
        )
        assert res.status_code == 200, res.text
        return {"Authorization": f"Bearer {res.json()['access_token']}"}

    return _login
