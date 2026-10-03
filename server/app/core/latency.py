"""How long the alerting path actually takes, measured rather than assumed.

A review of this system found that its single most important number -- the delay
between a patient pressing a button and a nurse being told -- was not recorded
anywhere. It could be measured by hand, and was, but nothing would ever notice it
getting worse. A system whose whole value is a latency needs that latency to be
an observed quantity, not a belief.

Deliberately small. No Prometheus, no metrics backend, no extra service to run on
a 1GB box: an in-memory ring of recent timings per route, read back over an
admin-only endpoint and summarised once a day by the existing alert job. That is
enough to answer "is it slower than it was" and "did a deploy make it worse",
which are the two questions anybody actually asks.

In-memory means the numbers reset when the process restarts. That is the right
trade here -- the alternative is writing a row per request to the same database
the request is waiting on.
"""

import threading
import time
from collections import defaultdict, deque

# Routes worth timing. Everything else on this server is management: slow is
# annoying there, while slow on these is a patient waiting longer.
#
# Matched by prefix against the route's path template, not the raw URL, so
# /api/v1/calls/1508/ack and /api/v1/calls/9/ack are one series rather than two
# thousand.
TRACKED_PREFIXES = (
    "/api/v1/calls",
    "/api/v1/auth/login",
    "/ws/calls",
)

# Roughly an hour of traffic on a busy clinic, and about 16KB of memory per
# route. Old entries fall off the end; this is a recent-history window, not an
# archive.
WINDOW = 512

_samples: dict[str, deque[float]] = defaultdict(lambda: deque(maxlen=WINDOW))
_lock = threading.Lock()


def record(route: str, seconds: float) -> None:
    with _lock:
        _samples[route].append(seconds)


def snapshot() -> dict[str, dict[str, float | int]]:
    """Percentiles per route, as of now.

    p95 rather than a mean: a mean hides the slow tail completely, and the slow
    tail is the entire question. The clinic whose answer times looked catastrophic
    turned out to have a mean of 435 minutes against a median of two -- the same
    lesson, one layer up.
    """
    out: dict[str, dict[str, float | int]] = {}
    with _lock:
        series = {route: sorted(values) for route, values in _samples.items() if values}

    for route, values in series.items():
        n = len(values)
        out[route] = {
            "count": n,
            "p50_ms": round(_percentile(values, 0.50) * 1000, 1),
            "p95_ms": round(_percentile(values, 0.95) * 1000, 1),
            "max_ms": round(values[-1] * 1000, 1),
        }
    return out


def _percentile(sorted_values: list[float], q: float) -> float:
    """Nearest-rank. With at most a few hundred samples, interpolating between
    neighbours would be false precision."""
    if not sorted_values:
        return 0.0
    i = max(0, min(len(sorted_values) - 1, round(q * (len(sorted_values) - 1))))
    return sorted_values[i]


def is_tracked(path: str) -> bool:
    return path.startswith(TRACKED_PREFIXES)


def route_key(request) -> str:
    """The route template this request matched, falling back to its raw path.

    MUST be read after the request has been routed. Starlette resolves the route
    inside the downstream app, so at middleware entry `scope["route"]` is not
    there yet and this silently returns the concrete URL -- which produced one
    series per call id, thousands of one-sample entries and no usable percentile
    for anything. Caught by a test written for exactly that.
    """
    route = request.scope.get("route")
    return getattr(route, "path", None) or request.url.path


async def timing_middleware(request, call_next):
    if not is_tracked(request.url.path):
        return await call_next(request)
    # perf_counter, not time(): this measures an interval, and a clock that can
    # be stepped by NTP mid-request would produce negative durations.
    started = time.perf_counter()
    try:
        return await call_next(request)
    finally:
        # Keyed here, after routing, not before it -- see route_key.
        record(route_key(request), time.perf_counter() - started)
