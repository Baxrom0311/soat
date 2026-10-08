"""Push fan-out and the async routes: regressions for the server pass of 2026-10-08."""

import threading
import time
import uuid

from app.models import PushToken
from app.services import fcm_service, push_service


def _tokens(db, c, n):
    rows = [
        PushToken(clinic_id=c["clinic"].id, staff_id=c["nurse"].id, expo_push_token=f"fcm-{uuid.uuid4().hex}")
        for _ in range(n)
    ]
    db.add_all(rows)
    db.commit()
    return rows


def test_fcm_messages_to_a_floor_go_out_in_parallel(make_clinic, db, monkeypatch):
    c = make_clinic()
    _tokens(db, c, 6)
    threads = set()

    def slow_send(token, **_):
        threads.add(threading.get_ident())
        time.sleep(0.3)
        return None

    monkeypatch.setattr(fcm_service, "is_configured", lambda: True)
    monkeypatch.setattr(fcm_service, "send", slow_send)

    started = time.monotonic()
    push_service.send_new_call_notifications(c["clinic"].id, call_id=1, room_number="101", floor=1)
    elapsed = time.monotonic() - started

    assert len(threads) > 1
    assert elapsed < 6 * 0.3 / 2, f"sequential fan-out took {elapsed:.2f}s"


def test_dead_tokens_are_still_removed_after_a_parallel_send(make_clinic, db, monkeypatch):
    c = make_clinic()
    dead, alive = _tokens(db, c, 2)
    monkeypatch.setattr(fcm_service, "is_configured", lambda: True)
    monkeypatch.setattr(
        fcm_service, "send", lambda token, **_: "UNREGISTERED" if token == dead.expo_push_token else None
    )

    push_service.send_new_call_notifications(c["clinic"].id, call_id=1, room_number="101", floor=1)

    remaining = {t.expo_push_token for t in db.query(PushToken).filter_by(clinic_id=c["clinic"].id)}
    assert remaining == {alive.expo_push_token}


class _Resp:
    def __init__(self, status, body):
        self.status_code = status
        self._body = body

    def json(self):
        return self._body


class _Http:
    def __init__(self, resp):
        self.resp = resp

    def post(self, *a, **k):
        return self.resp


def _fcm_error(monkeypatch, message):
    monkeypatch.setattr(fcm_service, "_load", lambda: (object(), "proj"))
    monkeypatch.setattr(fcm_service, "_access_token", lambda: "access")
    body = {"error": {"status": "INVALID_ARGUMENT", "message": message, "details": []}}
    monkeypatch.setattr(fcm_service, "_http", lambda: _Http(_Resp(400, body)))
    return fcm_service.send("tok", title="t", body="b", data={})


def test_a_malformed_message_does_not_read_as_a_dead_token(monkeypatch):
    assert _fcm_error(monkeypatch, "Invalid value at 'message.data[0].value'") is None


def test_an_invalid_registration_token_is_reported_dead(monkeypatch):
    assert (
        _fcm_error(monkeypatch, "The registration token is not a valid FCM registration token")
        == "INVALID_ARGUMENT"
    )


def test_binding_a_button_still_works_through_the_threadpool(client, make_clinic, login):
    c = make_clinic()
    room = client.post("/api/v1/rooms", headers=login(c["admin"]), json={"room_number": "202", "floor": 2})
    assert room.status_code == 201, room.text
    res = client.post(
        "/api/v1/buttons",
        headers=login(c["admin"]),
        json={"room_id": room.json()["id"], "ev1527_code": 7654321},
    )
    assert res.status_code == 201, res.text
    assert res.json()["room_number"] == "202"
    dup = client.post(
        "/api/v1/buttons",
        headers=login(c["admin"]),
        json={"room_id": room.json()["id"], "ev1527_code": 7654321},
    )
    assert dup.status_code == 409
