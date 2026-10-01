"""A clinic that has not paid loses its reports, never its patients.

The gate is deliberately asymmetric and the asymmetry is the whole design: management
routes answer 402, while every route a waiting patient depends on stays open. Getting
this backwards would mean an unpaid invoice silently switching off a nurse-call system
in a working hospital.

The split lives in two dependencies -- get_clinic_user (gated, the default) and
get_clinic_user_ungated (the explicit exception) -- so these tests are also what stops
the alerting routes quietly acquiring the gate when someone tidies the imports.
"""

from datetime import datetime, timedelta, timezone

from app.enums import SubscriptionStatus

PAST = datetime.now(timezone.utc) - timedelta(days=400)


def _blocked_clinic(make_clinic):
    """Overdue far past any grace window, with enforcement on."""
    return make_clinic(
        subscription_status=SubscriptionStatus.ACTIVE,
        paid_until=PAST,
        enforcement_enabled=True,
    )


def _press(client, clinic):
    return client.post(
        "/api/v1/calls",
        json={"device_id": clinic["device_id"], "ev1527_code": clinic["ev1527_code"]},
        headers={"X-Device-Key": clinic["device_key"]},
    )


# --------------------------------------------------------------- stays open


def test_a_patient_can_still_call_when_the_clinic_is_blocked(client, make_clinic):
    c = _blocked_clinic(make_clinic)
    assert _press(client, c).status_code == 201, "to'lovsiz klinikada bemor chaqira olmadi"


def test_a_nurse_still_sees_live_calls_when_the_clinic_is_blocked(client, make_clinic, login):
    c = _blocked_clinic(make_clinic)
    _press(client, c)
    res = client.get("/api/v1/calls/active", headers=login(c["nurse"]))
    assert res.status_code == 200, res.text
    assert len(res.json()) == 1


def test_a_nurse_can_still_acknowledge_when_the_clinic_is_blocked(client, make_clinic, login):
    c = _blocked_clinic(make_clinic)
    call_id = _press(client, c).json()["call_id"]
    res = client.post(f"/api/v1/calls/{call_id}/ack", json={}, headers=login(c["nurse"]))
    assert res.status_code == 200, res.text


def test_a_phone_can_still_register_for_push_when_the_clinic_is_blocked(client, make_clinic, login):
    """Otherwise a nurse reinstalling the app during an unpaid month goes silent."""
    c = _blocked_clinic(make_clinic)
    res = client.post(
        "/api/v1/push-tokens",
        json={"expo_push_token": "ExponentPushToken[test-blocked-clinic]"},
        headers=login(c["nurse"]),
    )
    assert res.status_code in (200, 201, 204), res.text


def test_signing_in_still_works_when_the_clinic_is_blocked(client, make_clinic, login):
    c = _blocked_clinic(make_clinic)
    assert login(c["nurse"])  # raises if login stopped returning 200


# ------------------------------------------------------------------- closed


def test_call_history_is_withheld_when_the_clinic_is_blocked(client, make_clinic, login):
    c = _blocked_clinic(make_clinic)
    res = client.get("/api/v1/calls/history?limit=10", headers=login(c["admin"]))
    assert res.status_code == 402, f"bloklangan klinika hisobotni oldi: {res.status_code}"
    assert res.json()["detail"] == "subscription_suspended"


def test_room_management_is_withheld_when_the_clinic_is_blocked(client, make_clinic, login):
    c = _blocked_clinic(make_clinic)
    res = client.get("/api/v1/rooms", headers=login(c["admin"]))
    assert res.status_code == 402


# ------------------------------------------------------- not blocked at all


def test_a_paid_clinic_keeps_its_reports(client, make_clinic, login):
    c = make_clinic(paid_until=datetime.now(timezone.utc) + timedelta(days=30))
    assert client.get("/api/v1/calls/history?limit=10", headers=login(c["admin"])).status_code == 200


def test_enforcement_off_means_overdue_changes_nothing(client, make_clinic, login):
    """The vendor's manual override, used while a payment conversation is happening."""
    c = make_clinic(paid_until=PAST, enforcement_enabled=False)
    assert client.get("/api/v1/calls/history?limit=10", headers=login(c["admin"])).status_code == 200


def test_a_trial_clinic_without_an_end_date_is_never_blocked(client, make_clinic, login):
    """NULL trial_ends_at means the trial does not lapse on its own -- migration 0009's
    whole point, so the mechanism could ship before the clinic conversations happened."""
    c = make_clinic(subscription_status=SubscriptionStatus.TRIAL, paid_until=None)
    assert client.get("/api/v1/calls/history?limit=10", headers=login(c["admin"])).status_code == 200
