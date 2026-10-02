"""One clinic must never see or touch another clinic's anything.

This is the property with the worst failure mode in the product. A billing bug costs
money; a tenancy bug puts one hospital's patient calls on another hospital's screen, and
nothing in the app would look wrong while it happened.

Every route below is checked with a *valid* token -- a real nurse, really signed in,
simply reaching for a row that is not hers. That is the realistic attack and the
realistic accident: an id typed into a URL, a stale id in a client, a copied script.
"""

from app.enums import CallStatus
from app.models import Call
from app.repositories import call_repo


def _press(client, clinic, *, code=None):
    """A patient presses a button, through the real device route."""
    res = client.post(
        "/api/v1/calls",
        json={
            "device_id": clinic["device_id"],
            "ev1527_code": code if code is not None else clinic["ev1527_code"],
        },
        headers={"X-Device-Key": clinic["device_key"]},
    )
    assert res.status_code == 201, res.text
    return res.json()["call_id"]


def test_active_calls_only_show_the_nurses_own_clinic(client, make_clinic, login):
    a = make_clinic(name="Klinika A", room_number="101")
    b = make_clinic(name="Klinika B", room_number="202")
    _press(client, a)
    _press(client, b)

    rooms = {c["room_number"] for c in client.get("/api/v1/calls/active", headers=login(a["nurse"])).json()}
    assert rooms == {"101"}, "boshqa klinikaning chaqiruvi ko'rinib qoldi"

    rooms_b = {c["room_number"] for c in client.get("/api/v1/calls/active", headers=login(b["nurse"])).json()}
    assert rooms_b == {"202"}


def test_a_nurse_cannot_acknowledge_another_clinics_call(client, make_clinic, login, db):
    a = make_clinic()
    b = make_clinic()
    call_id = _press(client, a)

    res = client.post(f"/api/v1/calls/{call_id}/ack", json={}, headers=login(b["nurse"]))
    assert res.status_code in (403, 404), f"B klinikasi A ning chaqiruvini yopdi: {res.status_code}"

    # And the call is genuinely untouched, not merely answered with an error code.
    db.expire_all()
    call = db.get(Call, call_id)
    assert call.status == CallStatus.ACTIVE
    assert call.acknowledged_by is None


def test_the_write_itself_refuses_a_foreign_clinic_id(client, make_clinic, db):
    """The repository's own tenancy check, tested where it actually lives.

    Over HTTP this never fires: the service looks the call up by (clinic_id, call_id)
    first and answers 404, so the WHERE clause in the UPDATE is a second line of
    defence that no route-level test can reach. It is there precisely so correctness
    does not depend on every future caller remembering to look up first -- and a
    defence nothing exercises is one that gets deleted as redundant. Removing the
    clinic_id from that WHERE passes every other test in this file.
    """
    a = make_clinic()
    b = make_clinic()
    call_id = _press(client, a)

    wrote = call_repo.acknowledge_if_active(db, b["clinic"].id, call_id, acknowledged_by="B klinikasi")
    db.commit()

    assert wrote is False, "repozitoriy begona klinika uchun yozdi"
    db.expire_all()
    assert db.get(Call, call_id).status == CallStatus.ACTIVE


def test_history_never_crosses_clinics(client, make_clinic, login):
    a = make_clinic(room_number="101")
    b = make_clinic(room_number="202")
    call_a = _press(client, a)
    _press(client, b)
    client.post(f"/api/v1/calls/{call_a}/ack", json={}, headers=login(a["nurse"]))

    history = client.get("/api/v1/calls/history?limit=200", headers=login(b["nurse"])).json()
    assert all(row["room_number"] != "101" for row in history)


def test_a_button_press_cannot_be_routed_through_another_clinics_receiver(client, make_clinic):
    """The EV1527 code is only unique per clinic, so this is a real collision.

    Two clinics may legitimately own buttons that transmit the same code -- they are
    cheap 433MHz remotes with no global registry. A press is therefore only meaningful
    together with the receiver that heard it, and the receiver belongs to one clinic.
    """
    make_clinic(ev1527_code=4242424, room_number="101")
    b = make_clinic(ev1527_code=4242424, room_number="202")

    # B's receiver reports A's code. Since both clinics own that code, the only correct
    # answer is B's room -- never A's.
    res = client.post(
        "/api/v1/calls",
        json={"device_id": b["device_id"], "ev1527_code": 4242424},
        headers={"X-Device-Key": b["device_key"]},
    )
    assert res.status_code == 201, res.text
    assert res.json()["room_number"] == "202"


def test_a_receivers_key_does_not_work_for_another_receiver(client, make_clinic):
    a = make_clinic()
    b = make_clinic()
    res = client.post(
        "/api/v1/calls",
        json={"device_id": a["device_id"], "ev1527_code": a["ev1527_code"]},
        headers={"X-Device-Key": b["device_key"]},
    )
    assert res.status_code in (401, 403), "boshqa qurilmaning kaliti ishladi"


def test_rooms_of_another_clinic_are_not_listed_or_editable(client, make_clinic, login):
    a = make_clinic(room_number="101")
    b = make_clinic(room_number="202")

    listed = client.get("/api/v1/rooms", headers=login(b["admin"])).json()
    assert all(r["room_number"] != "101" for r in listed)

    res = client.delete(f"/api/v1/rooms/{a['room'].id}", headers=login(b["admin"]))
    assert res.status_code in (403, 404), "boshqa klinikaning xonasi o'chirildi"
