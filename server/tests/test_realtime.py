"""Live events that outlive the process that created them.

Before the outbox, a push was a background task in memory: a restart between the
commit and the send lost the alert with no trace. And a websocket event could only come
from the process holding the socket, so a background job closing a call reached no
screen at all.
"""

import asyncio
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.enums import CallStatus
from app.main import app
from app.models import Call, OutboxEvent
from app.realtime import outbox
from app.realtime.dispatcher import Dispatcher
from app.services import push_service


def press(client, c):
    res = client.post(
        "/api/v1/calls",
        json={"device_id": c["device_id"], "ev1527_code": c["ev1527_code"]},
        headers={"X-Device-Key": c["device_key"]},
    )
    assert res.status_code == 201, res.text
    return res.json()["call_id"]


@pytest.fixture
def pushes(monkeypatch):
    sent = []
    monkeypatch.setattr(
        push_service,
        "send_new_call_notifications",
        lambda clinic_id, **kw: sent.append(("new_call", clinic_id, kw["call_id"])),
    )
    monkeypatch.setattr(
        push_service,
        "send_ack_notifications",
        lambda clinic_id, call_id: sent.append(("cancel", clinic_id, call_id)),
    )
    return sent


def events_for(db, clinic_id):
    db.expire_all()
    return db.scalars(
        select(OutboxEvent).where(OutboxEvent.clinic_id == clinic_id).order_by(OutboxEvent.id)
    ).all()


def test_a_press_records_its_event_and_sends_the_push_once(client, make_clinic, db, pushes):
    c = make_clinic()
    call_id = press(client, c)

    [event] = events_for(db, c["clinic"].id)
    assert event.message["type"] == "new_call"
    assert event.message["call"]["call_id"] == call_id
    assert event.floor == c["room"].floor
    assert event.push_done_at is not None
    assert pushes == [("new_call", c["clinic"].id, call_id)]

    # Nothing left for the sweeper: the request path claimed and finished it.
    outbox.sweep_pushes()
    assert pushes.count(("new_call", c["clinic"].id, call_id)) == 1


def test_a_push_lost_with_its_process_is_swept(client, make_clinic, db, pushes, monkeypatch):
    """The restart case: committed, but the background task never ran."""
    monkeypatch.setattr(outbox, "deliver_push", lambda event_id: None)
    c = make_clinic()
    call_id = press(client, c)
    assert pushes == []

    [event] = events_for(db, c["clinic"].id)
    event.created_at = datetime.now(timezone.utc) - timedelta(seconds=30)
    db.commit()

    outbox.sweep_pushes()
    outbox.sweep_pushes()
    assert pushes.count(("new_call", c["clinic"].id, call_id)) == 1
    assert events_for(db, c["clinic"].id)[0].push_done_at is not None


def test_a_claim_that_never_finished_is_retried(client, make_clinic, db, pushes, monkeypatch):
    monkeypatch.setattr(outbox, "deliver_push", lambda event_id: None)
    c = make_clinic()
    call_id = press(client, c)
    [event] = events_for(db, c["clinic"].id)
    event.created_at = datetime.now(timezone.utc) - timedelta(minutes=3)
    event.push_claimed_at = datetime.now(timezone.utc) - timedelta(minutes=2)
    event.push_attempts = 1
    db.commit()

    outbox.sweep_pushes()
    assert ("new_call", c["clinic"].id, call_id) in pushes


def test_a_push_too_old_to_matter_is_not_sent(client, make_clinic, db, pushes, monkeypatch):
    monkeypatch.setattr(outbox, "deliver_push", lambda event_id: None)
    c = make_clinic()
    press(client, c)
    [event] = events_for(db, c["clinic"].id)
    event.created_at = datetime.now(timezone.utc) - timedelta(hours=1)
    db.commit()

    outbox.sweep_pushes()
    assert pushes == []


def test_an_ack_that_lost_the_race_leaves_no_event(client, make_clinic, login, db, pushes):
    c = make_clinic()
    call_id = press(client, c)
    headers = login(c["nurse"])
    assert client.post(f"/api/v1/calls/{call_id}/ack", headers=headers, json={}).status_code == 200
    assert client.post(f"/api/v1/calls/{call_id}/ack", headers=headers, json={}).status_code == 409

    acks = [e for e in events_for(db, c["clinic"].id) if e.message["type"] == "ack"]
    assert len(acks) == 1
    assert pushes.count(("cancel", c["clinic"].id, call_id)) == 1


def test_expiry_tells_screens_and_phones(client, make_clinic, db, pushes):
    from jobs import expire_stale_calls

    c = make_clinic()
    call_id = press(client, c)
    db.expire_all()
    db.get(Call, call_id).created_at = datetime.now(timezone.utc) - timedelta(hours=20)
    db.commit()

    assert expire_stale_calls.run() == 0
    closing = [
        e for e in events_for(db, c["clinic"].id) if e.message.get("status") == CallStatus.EXPIRED.value
    ]
    assert len(closing) == 1
    # "ack" so the boards and phones already in the field drop it.
    assert closing[0].message == {"type": "ack", "call_id": call_id, "status": "expired"}
    assert closing[0].push == {"kind": "cancel", "call_id": call_id}


def test_another_process_event_reaches_this_process_sockets(make_clinic, login, db, monkeypatch):
    """What a background job or a second worker needs: an event committed elsewhere
    arrives on a board connected here."""
    c = make_clinic()
    with TestClient(app) as client:
        token = login(c["nurse"])["Authorization"].split(" ")[1]
        with client.websocket_connect("/ws/calls", subprotocols=["bearer", token]) as ws:
            from app.realtime.dispatcher import dispatcher

            assert client.portal.call(asyncio.wait_for, dispatcher.connected.wait(), 5) is True
            monkeypatch.setattr(outbox, "origin", lambda: "another-process")
            outbox.record(db, c["clinic"].id, {"type": "ack", "call_id": 424242, "status": "expired"})
            db.commit()
            monkeypatch.undo()
            assert ws.receive_json() == {"type": "ack", "call_id": 424242, "status": "expired"}


def test_this_process_does_not_rebroadcast_its_own_events():
    """Its own events already went out on the fast path; a second copy would ring twice."""
    delivered = []

    class Event:
        id = 7
        clinic_id = 1
        message = {"type": "new_call"}
        floor = None
        origin = outbox.origin()

    d = Dispatcher()
    import app.realtime.dispatcher as module

    original = module.manager.broadcast

    async def fake_broadcast(*args, **kwargs):
        delivered.append(args)

    module.manager.broadcast = fake_broadcast
    try:
        asyncio.run(d._deliver(Event()))
    finally:
        module.manager.broadcast = original
    assert delivered == []
    assert d.last_id == 7
