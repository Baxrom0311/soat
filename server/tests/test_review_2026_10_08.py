"""Regressions for the 2026-10-08 review fixes."""

import asyncio
from datetime import datetime, timedelta, timezone

from app.core.security import generate_device_key, hash_device_key
from app.main import DASHBOARD_DIR
from app.models import Device
from app.repositories import device_repo
from app.services import admin_service
from app.ws_manager import ConnectionManager


def test_overview_buckets_by_tashkent_wall_clock(client, make_clinic, db):
    c = make_clinic()
    res = client.post(
        "/api/v1/calls",
        json={"device_id": c["device_id"], "ev1527_code": c["ev1527_code"]},
        headers={"X-Device-Key": c["device_key"]},
    )
    assert res.status_code == 201, res.text

    out = admin_service.overview(db)

    tashkent_now = datetime.now(timezone(timedelta(hours=5)))
    assert out.daily_stats[-1].date == tashkent_now.date().isoformat()
    assert out.daily_stats[-1].calls_count >= 1
    assert len(out.daily_stats) == 14
    created = datetime.fromisoformat(res.json()["created_at"])
    assert out.hourly_stats[created.astimezone(timezone(timedelta(hours=5))).hour].calls_count >= 1
    mine = next(s for s in out.top_clinics if s.id == c["clinic"].id)
    assert (mine.rooms_count, mine.buttons_count, mine.devices_count, mine.calls_count) == (1, 1, 1, 1)
    assert mine.status == "active"


class _Socket:
    def __init__(self):
        self.sent: list[str] = []

    async def send_text(self, text: str) -> None:
        self.sent.append(text)

    async def close(self, code: int) -> None:
        pass


def test_broadcast_only_rereads_sockets_whose_staff_changed():
    m = ConnectionManager()
    reads = {"a": 0, "b": 0}

    def validator(name):
        async def _validate():
            reads[name] += 1
            return ("nurse", [])

        return _validate

    a, b = _Socket(), _Socket()
    m.register(a, 1, role="nurse", validate=validator("a"), staff_id=10)
    m.register(b, 1, role="nurse", validate=validator("b"), staff_id=20)

    asyncio.run(m.broadcast(1, {"type": "new_call"}))
    assert reads == {"a": 0, "b": 0}

    m.mark_staff_dirty(10)
    asyncio.run(m.broadcast(1, {"type": "new_call"}))
    asyncio.run(m.broadcast(1, {"type": "new_call"}))
    assert reads == {"a": 1, "b": 0}
    assert len(a.sent) == len(b.sent) == 3


def test_expired_plaintext_provisioning_keys_are_scrubbed(make_clinic, db):
    c = make_clinic()
    old, fresh = generate_device_key(), generate_device_key()
    now = datetime.now(timezone.utc)
    rows = [
        Device(
            clinic_id=c["clinic"].id,
            device_id=f"{c['device_id']}-{i}",
            device_api_key_hash=hash_device_key(key),
            floor=1,
            pending_key_plaintext=key,
            created_at=created,
        )
        for i, (key, created) in enumerate([(old, now - timedelta(hours=1)), (fresh, now)])
    ]
    db.add_all(rows)
    db.commit()

    device_repo.clear_expired_pending_keys(db, claimed_before=now - timedelta(minutes=15))
    db.commit()
    for row in rows:
        db.refresh(row)

    assert rows[0].pending_key_plaintext is None
    assert rows[1].pending_key_plaintext == fresh


def test_staff_cannot_be_created_with_a_short_password(client, make_clinic, login):
    c = make_clinic()
    res = client.post(
        "/api/v1/staff",
        headers=login(c["admin"]),
        json={"email": "qisqa@test.uz", "password": "123", "role": "nurse", "name": "Q"},
    )
    assert res.status_code == 422


def test_dashboard_is_served_with_a_content_security_policy(client):
    index = DASHBOARD_DIR / "index.html"
    created = not index.exists()
    if created:
        index.write_text("<!doctype html><title>t</title>")
    try:
        res = client.get("/login")
    finally:
        if created:
            index.unlink()
    assert res.status_code == 200
    csp = res.headers["content-security-policy"]
    assert "script-src 'self'" in csp
    assert "'unsafe-inline'" not in csp.split("script-src", 1)[1].split(";", 1)[0]
    assert "frame-ancestors 'none'" in csp
