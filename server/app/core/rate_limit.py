"""Shared in-memory sliding-window rate limiter.

Per-process state, which is only correct because this app runs as a single uvicorn
worker (see database.py's connection-pool sizing note for the same constraint). If this
is ever scaled to multiple workers/instances, each one would enforce its own independent
budget instead of one true shared limit -- at that point this needs to move to something
shared across processes (e.g. Redis).

Memory is bounded. The earlier version used a defaultdict with no eviction, so every
novel key -- including keys from *rejected* requests -- became permanently resident.
Keys are attacker-chosen on the IP-keyed limiters (contact form, /announce, login), and
an IPv6 /64 supplies 2^64 of them, so on a 961MB box that already leans on swap that was
a straightforward path to OOM-killing the API and taking the whole alerting system down.

When the table fills, behaviour depends on `protect_limited`, because the two kinds of
limiter in this codebase want opposite failure modes:

  protect_limited=True (default) -- a key that is CURRENTLY over budget is never
    evicted, and if the table is full of such keys the new key is refused. Required for
    anything guarding a secret (login, and the unauthenticated device/contact
    endpoints): plain LRU eviction would let an attacker flush their own active lockout
    by pushing max_keys novel keys through, which silently restores unlimited password
    guessing. Verified: that is exactly what a naive LRU did.

  protect_limited=False -- always evict the least-recently-used key and admit the new
    one, never refuse. For limiters on the patient-call ingestion path, where a table
    pressured by an unrelated attacker must never turn into a refused button press. The
    worst case there is an attacker resetting their own budget, which is no worse than
    having no limiter for that key at all.
"""

import time
from collections import OrderedDict, deque

# ~900 bytes of resident state per key (deque + key + dict slot), so the default cap is
# worth roughly 9MB -- enough for every plausible legitimate caller, small enough to be
# irrelevant next to the process footprint.
DEFAULT_MAX_KEYS = 10_000


class SlidingWindowLimiter:
    def __init__(
        self,
        *,
        max_events: int,
        window_seconds: float,
        max_keys: int = DEFAULT_MAX_KEYS,
        protect_limited: bool = True,
    ):
        self.max_events = max_events
        self.window_seconds = window_seconds
        self.max_keys = max_keys
        self.protect_limited = protect_limited
        self._events: OrderedDict[str, deque[float]] = OrderedDict()

    def _is_over_budget(self, window: deque[float], now: float) -> bool:
        live = sum(1 for t in window if now - t <= self.window_seconds)
        return live >= self.max_events

    def _drop_expired(self, now: float) -> None:
        """Removes keys whose whole window has aged out. Cheap because insertion order
        approximates last-touch order, so the expired keys cluster at the front."""
        stale = []
        for key, window in self._events.items():
            if window and now - window[-1] <= self.window_seconds:
                break  # everything after this was touched at least as recently
            stale.append(key)
        for key in stale:
            del self._events[key]

    def _make_room(self, now: float) -> bool:
        """Frees one slot. With protect_limited the scan skips keys that are currently
        over budget, so an active lockout survives a key-rotation flood. Returns False
        if nothing evictable was found."""
        for candidate, window in self._events.items():
            if self.protect_limited and self._is_over_budget(window, now):
                continue
            del self._events[candidate]
            return True
        return False

    def check(self, key: str) -> bool:
        """Returns True and records the event if `key` is under budget; returns
        False (without recording anything) if it is not -- a rejected call doesn't
        count against the caller, so retrying once older events age out of the
        window succeeds without needing to "wait out" its own rejected attempts."""
        now = time.monotonic()
        window = self._events.get(key)

        if window is None:
            if len(self._events) >= self.max_keys:
                self._drop_expired(now)
            if len(self._events) >= self.max_keys and not self._make_room(now):
                # Only reachable with protect_limited=True and a table entirely full of
                # actively-limited keys. Refusing is the safe end: it cannot resurrect
                # a lockout, and the callers that must never refuse use
                # protect_limited=False.
                return False
            window = deque()
            self._events[key] = window
        else:
            while window and now - window[0] > self.window_seconds:
                window.popleft()

        if len(window) >= self.max_events:
            # Keep it hot: an actively-rejected key is the last one we want evicted.
            self._events.move_to_end(key)
            return False

        window.append(now)
        self._events.move_to_end(key)
        return True

    def tracked_keys(self) -> int:
        """For observability/tests -- proves the table stays bounded."""
        return len(self._events)
