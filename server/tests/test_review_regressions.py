"""Integration regressions against the migrated PostgreSQL schema."""

import hashlib
import uuid
from functools import partial

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.core.deps import CurrentUser
from app.main import app
from app.models import Call, DiscoveredDevice, PushToken, UnassignedSignal
from app.repositories import staff_floor_repo
from app.services import admin_service, discovered_device_service, push_service
from app.ws_manager import manager


def press(client, clinic):
    res = client.post(
        "/api/v1/calls",
        json={"device_id": clinic["device_id"], "ev1527_code": clinic["ev1527_code"]},
        headers={"X-Device-Key": clinic["device_key"]},
    )
    assert res.status_code == 201, res.text
    return res.json()["call_id"]


@pytest.mark.parametrize("path", ["own", "admin", "superadmin"])
def test_password_change_revokes_tokens_and_push_registrations(client, make_clinic, login, db, path):
    c = make_clinic()
    headers = login(c["nurse"])
    client.post(
        "/api/v1/push-tokens", headers=headers, json={"expo_push_token": "review-token-" + uuid.uuid4().hex}
    )
    if path == "own":
        result = client.post(
            "/api/v1/auth/change-password",
            headers=headers,
            json={"current_password": c["password"], "new_password": "changed-password-123"},
        )
        assert result.status_code == 204
    elif path == "admin":
        result = client.patch(
            f"/api/v1/staff/{c['nurse'].id}",
            headers=login(c["admin"]),
            json={"password": "changed-password-123"},
        )
        assert result.status_code == 200, result.text
    else:
        actor = CurrentUser(c["admin"].id, c["clinic"].id, "superadmin", c["admin"].email, "Audit")
        admin_service.reset_staff_password(db, c["clinic"].id, c["nurse"].id, actor=actor)
    assert client.get("/api/v1/calls/active", headers=headers).status_code == 401
    assert client.post("/api/v1/auth/refresh", headers=headers).status_code == 401
    db.expire_all()
    assert db.query(PushToken).filter_by(staff_id=c["nurse"].id).count() == 0
    if path != "superadmin":
        fresh = login(c["nurse"], "changed-password-123")
        assert client.get("/api/v1/calls/active", headers=fresh).status_code == 200


def test_ack_uses_authenticated_name_and_sends_cancellation(client, make_clinic, login, db, monkeypatch):
    c = make_clinic()
    call_id = press(client, c)
    cancelled = []
    monkeypatch.setattr(
        push_service, "send_ack_notifications", lambda clinic, call: cancelled.append((clinic, call))
    )
    response = client.post(
        f"/api/v1/calls/{call_id}/ack", headers=login(c["nurse"]), json={"acknowledged_by": "forged name"}
    )
    assert response.status_code == 200
    assert db.get(Call, call_id).acknowledged_by == c["nurse"].name
    assert cancelled == [(c["clinic"].id, call_id)]


def test_ack_cannot_bypass_floor_assignment(client, make_clinic, login, db):
    c = make_clinic(floor=2)
    call_id = press(client, c)
    staff_floor_repo.set_floors(db, c["nurse"].id, [1])
    db.commit()
    assert client.post(f"/api/v1/calls/{call_id}/ack", headers=login(c["nurse"]), json={}).status_code == 403
    assert client.post(f"/api/v1/calls/{call_id}/ack", headers=login(c["admin"]), json={}).status_code == 200


def test_announce_requires_device_proof_and_physical_pairing_code(client, make_clinic, db):
    c = make_clinic()
    chip = uuid.uuid4().hex[:12]
    secret = uuid.uuid4().hex + uuid.uuid4().hex
    body = {"chip_id": chip, "provisioning_secret": secret}
    assert client.post("/api/v1/devices/announce", json={"chip_id": chip}).status_code == 422
    assert client.post("/api/v1/devices/announce", json=body).status_code == 200
    with pytest.raises(Exception) as error:
        discovered_device_service.claim(
            db, chip_id=chip, clinic_id=c["clinic"].id, floor=1, device_id=None, pairing_code="0" * 12
        )
    assert error.value.status_code == 403
    claimed = discovered_device_service.claim(
        db,
        chip_id=chip,
        clinic_id=c["clinic"].id,
        floor=1,
        device_id=None,
        pairing_code=hashlib.sha256(secret.encode()).hexdigest()[:12],
    )
    other = client.post("/api/v1/devices/announce", json={**body, "provisioning_secret": "f" * 64})
    assert other.status_code == 403
    response = client.post("/api/v1/devices/announce", json=body)
    assert response.status_code == 200
    key = response.json()["device_key"]
    assert key
    heartbeat = client.post(
        "/api/v1/devices/heartbeat", json={"device_id": claimed.device_id}, headers={"X-Device-Key": key}
    )
    assert heartbeat.status_code == 200
    assert client.post("/api/v1/devices/announce", json=body).json()["device_key"] is None


def test_overlong_device_id_is_rejected(client, make_clinic, login):
    c = make_clinic()
    result = client.post(
        "/api/v1/devices", headers=login(c["admin"]), json={"device_id": "x" * 30, "floor": 1}
    )
    assert result.status_code == 422


def test_deleted_staff_cannot_keep_an_open_socket(make_clinic, login, db):
    c = make_clinic()
    with TestClient(app) as client:
        token = login(c["nurse"])["Authorization"].split(" ")[1]
        with client.websocket_connect("/ws/calls", subprotocols=["bearer", token]) as ws:
            db.delete(c["nurse"])
            db.commit()
            ws.send_text("ping")
            with pytest.raises(WebSocketDisconnect) as closed:
                ws.receive_json()
            assert closed.value.code == 4401


def test_open_socket_uses_current_floor_permissions(make_clinic, login, db):
    c = make_clinic()
    with TestClient(app) as client:
        token = login(c["nurse"])["Authorization"].split(" ")[1]
        with client.websocket_connect("/ws/calls", subprotocols=["bearer", token]) as ws:
            staff_floor_repo.set_floors(db, c["nurse"].id, [2])
            db.commit()
            client.portal.call(partial(manager.broadcast, c["clinic"].id, {"type": "hidden"}, floor=1))
            client.portal.call(partial(manager.broadcast, c["clinic"].id, {"type": "visible"}, floor=2))
            assert ws.receive_json()["type"] == "visible"


def test_device_deletion_keeps_calls_and_applies_migrated_foreign_keys(client, make_clinic, login, db):
    c = make_clinic()
    call_id = press(client, c)
    discovery = DiscoveredDevice(chip_id=uuid.uuid4().hex, claimed_device_id=c["device"].id)
    signal = UnassignedSignal(clinic_id=c["clinic"].id, device_id=c["device"].id, ev1527_code=999)
    db.add_all([discovery, signal])
    db.commit()
    result = client.delete(f"/api/v1/devices/{c['device'].id}", headers=login(c["admin"]))
    assert result.status_code == 204
    db.expire_all()
    assert db.get(Call, call_id).device_id is None
    assert db.get(DiscoveredDevice, discovery.id).claimed_device_id is None
    assert db.query(UnassignedSignal).filter_by(clinic_id=c["clinic"].id).count() == 0
