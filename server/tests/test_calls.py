"""The call's own lifecycle: pressed once, answered once, closed eventually.

Three things are easy to get wrong here and all three are invisible when they are wrong.
A button pressed twice must not become two calls on a nurse's screen. Two nurses tapping
acknowledge at the same moment must not both be credited. And a call nobody ever closed
must stop counting as a patient waiting without ever being recorded as answered.
"""

from datetime import datetime, timedelta, timezone

from app.enums import CallStatus
from app.models import Call
from app.repositories import call_repo


def _press(client, clinic, **extra):
    return client.post(
        "/api/v1/calls",
        json={"device_id": clinic["device_id"], "ev1527_code": clinic["ev1527_code"], **extra},
        headers={"X-Device-Key": clinic["device_key"]},
    )


# -------------------------------------------------------------- one press, one call


def test_the_same_press_id_twice_returns_the_same_call(client, make_clinic):
    """The receiver re-sends a press whose response it never saw. That must not double."""
    c = make_clinic()
    first = _press(client, c, press_id="p-abc-1")
    second = _press(client, c, press_id="p-abc-1")
    assert first.status_code == 201 and second.status_code in (200, 201)
    assert first.json()["call_id"] == second.json()["call_id"]


def test_pressing_again_while_a_call_is_open_does_not_create_a_second(client, make_clinic, login):
    """A patient who presses three times is one patient, not three calls."""
    c = make_clinic()
    _press(client, c)
    _press(client, c)
    _press(client, c)
    active = client.get("/api/v1/calls/active", headers=login(c["nurse"])).json()
    assert len(active) == 1


# ------------------------------------------------------------ answered exactly once


def test_only_the_first_acknowledgement_wins(client, make_clinic, login):
    c = make_clinic()
    call_id = _press(client, c).json()["call_id"]

    first = client.post(f"/api/v1/calls/{call_id}/ack", json={}, headers=login(c["nurse"]))
    second = client.post(f"/api/v1/calls/{call_id}/ack", json={}, headers=login(c["admin"]))

    assert first.status_code == 200, first.text
    assert second.status_code == 409, f"ikkinchi qabul ham o'tdi: {second.status_code}"


def test_the_second_acknowledgement_does_not_overwrite_who_answered(client, make_clinic, login, db):
    c = make_clinic()
    call_id = _press(client, c).json()["call_id"]
    client.post(f"/api/v1/calls/{call_id}/ack", json={}, headers=login(c["nurse"]))
    client.post(f"/api/v1/calls/{call_id}/ack", json={}, headers=login(c["admin"]))

    db.expire_all()
    call = db.get(Call, call_id)
    assert call.acknowledged_by == c["nurse"].name, "ikkinchi bosgan odam birinchining nomini o'chirdi"


def test_an_acknowledged_call_leaves_the_live_list(client, make_clinic, login):
    c = make_clinic()
    call_id = _press(client, c).json()["call_id"]
    client.post(f"/api/v1/calls/{call_id}/ack", json={}, headers=login(c["nurse"]))
    assert client.get("/api/v1/calls/active", headers=login(c["nurse"])).json() == []


# ------------------------------------------------------------------- expiry by clock


def test_expiry_closes_only_calls_older_than_the_cutoff(client, make_clinic, login, db):
    c = make_clinic()
    old_id = _press(client, c).json()["call_id"]
    db.expire_all()
    db.get(Call, old_id).created_at = datetime.now(timezone.utc) - timedelta(hours=20)
    db.commit()

    cutoff = datetime.now(timezone.utc) - timedelta(hours=12)
    closed = call_repo.expire_stale(db, older_than=cutoff)
    db.commit()

    assert closed == 1
    db.expire_all()
    assert db.get(Call, old_id).status == CallStatus.EXPIRED


def test_a_fresh_call_is_never_expired(client, make_clinic, db):
    c = make_clinic()
    call_id = _press(client, c).json()["call_id"]
    cutoff = datetime.now(timezone.utc) - timedelta(hours=12)
    assert call_repo.expire_stale(db, older_than=cutoff) == 0
    db.commit()
    db.expire_all()
    assert db.get(Call, call_id).status == CallStatus.ACTIVE


def test_expiry_never_claims_the_call_was_answered(client, make_clinic, db):
    """The figure every answer-time statistic is computed from must stay empty."""
    c = make_clinic()
    call_id = _press(client, c).json()["call_id"]
    db.expire_all()
    db.get(Call, call_id).created_at = datetime.now(timezone.utc) - timedelta(days=3)
    db.commit()

    call_repo.expire_stale(db, older_than=datetime.now(timezone.utc) - timedelta(hours=12))
    db.commit()
    db.expire_all()

    call = db.get(Call, call_id)
    assert call.acknowledged_at is None
    assert call.acknowledged_by is None


def test_expiry_cannot_overwrite_a_call_a_nurse_just_answered(client, make_clinic, login, db):
    """A nurse answering at the stroke of the deadline keeps the answer.

    Both writes insist on status = ACTIVE, so whichever lands first wins and the other
    changes nothing. Here the nurse lands first, which is the case that would be a
    silent data loss if the clock were allowed to overwrite.
    """
    c = make_clinic()
    call_id = _press(client, c).json()["call_id"]
    db.expire_all()
    db.get(Call, call_id).created_at = datetime.now(timezone.utc) - timedelta(days=2)
    db.commit()

    client.post(f"/api/v1/calls/{call_id}/ack", json={}, headers=login(c["nurse"]))
    closed = call_repo.expire_stale(db, older_than=datetime.now(timezone.utc) - timedelta(hours=12))
    db.commit()

    assert closed == 0
    db.expire_all()
    call = db.get(Call, call_id)
    assert call.status == CallStatus.ACKNOWLEDGED
    assert call.acknowledged_by == c["nurse"].name


def test_an_expired_call_is_gone_from_the_live_list(client, make_clinic, login, db):
    c = make_clinic()
    call_id = _press(client, c).json()["call_id"]
    db.expire_all()
    db.get(Call, call_id).created_at = datetime.now(timezone.utc) - timedelta(days=2)
    db.commit()
    call_repo.expire_stale(db, older_than=datetime.now(timezone.utc) - timedelta(hours=12))
    db.commit()

    assert client.get("/api/v1/calls/active", headers=login(c["nurse"])).json() == []
