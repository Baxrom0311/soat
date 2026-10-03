"""The alerting path is timed, and the timing is honest.

This exists because a review found the one number the whole product is about --
button press to nurse notified -- was recorded nowhere. Measuring it by hand
answers "is it fast today"; nothing answered "did it get slower".

The tests below are mostly about what the summary must NOT do: report a mean
that hides the slow tail, split one endpoint into a series per call id, or claim
a percentile from samples it does not have.
"""

from app.core import latency


def _reset():
    with latency._lock:
        latency._samples.clear()


def test_a_call_is_timed(client, make_clinic):
    _reset()
    c = make_clinic()
    client.post(
        "/api/v1/calls",
        json={"device_id": c["device_id"], "ev1527_code": c["ev1527_code"]},
        headers={"X-Device-Key": c["device_key"]},
    )
    snap = latency.snapshot()
    assert snap, "chaqiruv yo'li o'lchanmadi"
    assert any("/api/v1/calls" in route for route in snap)


def test_management_routes_are_not_timed(client, make_clinic, login):
    """Only the alerting path. Timing everything would make the summary a wall of
    numbers nobody reads, and slow is a different kind of problem on a report."""
    _reset()
    c = make_clinic()
    client.get("/api/v1/rooms", headers=login(c["admin"]))
    assert "/api/v1/rooms" not in latency.snapshot()


def test_one_endpoint_is_one_series_whatever_the_call_id(client, make_clinic, login):
    """Keyed by the route template, not the URL.

    Keyed by the raw path, a week of production would produce thousands of
    one-sample series and no usable percentile for anything.
    """
    _reset()
    c = make_clinic()
    for _ in range(3):
        res = client.post(
            "/api/v1/calls",
            json={"device_id": c["device_id"], "ev1527_code": c["ev1527_code"]},
            headers={"X-Device-Key": c["device_key"]},
        )
        call_id = res.json()["call_id"]
        client.post(f"/api/v1/calls/{call_id}/ack", json={}, headers=login(c["nurse"]))

    ack_series = [r for r in latency.snapshot() if r.endswith("/ack")]
    assert len(ack_series) == 1, f"har bir call_id uchun alohida qator yaratildi: {ack_series}"
    assert latency.snapshot()[ack_series[0]]["count"] == 3


def test_the_summary_reports_the_tail_not_an_average():
    """p95 must follow the slow samples, which is the entire point.

    One clinic's answer-time mean read 435 minutes against a median of two; a
    mean here would hide the opposite case just as completely.
    """
    _reset()
    # 94/6 rather than 95/5 on purpose: at exactly five per cent the p95 sits on
    # the knife edge between the fast and slow groups and either answer is
    # defensible, so the test would be asserting a rounding rule rather than the
    # behaviour it cares about.
    for _ in range(94):
        latency.record("/x", 0.010)
    for _ in range(6):
        latency.record("/x", 2.000)

    s = latency.snapshot()["/x"]
    assert s["p50_ms"] == 10.0
    assert s["p95_ms"] >= 1000, "sekin dum yo'qolib ketdi"
    assert s["max_ms"] == 2000.0


def test_percentiles_of_a_single_sample_do_not_invent_precision():
    _reset()
    latency.record("/x", 0.250)
    s = latency.snapshot()["/x"]
    assert s["count"] == 1
    assert s["p50_ms"] == s["p95_ms"] == s["max_ms"] == 250.0


def test_the_window_is_bounded_so_memory_cannot_grow():
    """A ring, not a log. This runs on a 1GB box beside Postgres."""
    _reset()
    for i in range(latency.WINDOW * 3):
        latency.record("/x", i / 1000)
    assert latency.snapshot()["/x"]["count"] == latency.WINDOW


def test_an_empty_route_is_absent_rather_than_zero():
    """A route with no samples must not report 0 ms, which reads as "instant"."""
    _reset()
    assert latency.snapshot() == {}


def test_the_endpoint_is_not_readable_by_a_clinic(client, make_clinic, login):
    _reset()
    c = make_clinic()
    for who in ("nurse", "admin"):
        res = client.get("/api/v1/meta/latency", headers=login(c[who]))
        assert res.status_code in (401, 403), f"{who} platformani o'lchovini o'qidi"
