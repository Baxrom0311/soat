"""Shared in-memory sliding-window rate limiter.

Per-process state (a plain dict), which is only correct because this app runs as a
single uvicorn worker (see database.py's connection-pool sizing note for the same
constraint). If this is ever scaled to multiple workers/instances, each one would
enforce its own independent budget instead of one true shared limit -- at that point
this needs to move to something shared across processes (e.g. Redis).
"""

import time
from collections import defaultdict, deque


class SlidingWindowLimiter:
    def __init__(self, *, max_events: int, window_seconds: float):
        self.max_events = max_events
        self.window_seconds = window_seconds
        self._events: dict[str, deque[float]] = defaultdict(deque)

    def check(self, key: str) -> bool:
        """Returns True and records the event if `key` is under budget; returns
        False (without recording anything) if it is not -- a rejected call doesn't
        count against the caller, so retrying once older events age out of the
        window succeeds without needing to "wait out" its own rejected attempts."""
        now = time.monotonic()
        window = self._events[key]
        while window and now - window[0] > self.window_seconds:
            window.popleft()
        if len(window) >= self.max_events:
            return False
        window.append(now)
        return True
