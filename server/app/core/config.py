"""Environment configuration. Loaded once at import time."""

import os
import secrets

from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv(
    "DATABASE_URL", "postgresql+psycopg://baxrom@127.0.0.1:5432/soat_nursecall"
)

# JWT_SECRET should be set in .env for prod; a random one is fine for a single dev-server run
# (it just means tokens become invalid if the process restarts without a fixed secret).
JWT_SECRET = os.getenv("JWT_SECRET") or secrets.token_hex(32)
if not os.getenv("JWT_SECRET"):
    import logging

    logging.getLogger(__name__).warning(
        "JWT_SECRET is not set — using a random per-process secret; "
        "all tokens will be invalidated on restart and multi-worker deployments will not work"
    )
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", "1440"))

# Repeat presses of the same room's button within this window are treated as one call
# (RF buttons retransmit and panicked patients mash the button).
CALL_DEDUPE_SECONDS = int(os.getenv("CALL_DEDUPE_SECONDS", "10"))

# A device counts as online if its last heartbeat/call arrived within this window.
DEVICE_ONLINE_WINDOW_SECONDS = int(os.getenv("DEVICE_ONLINE_WINDOW_SECONDS", "180"))

# Zero-touch ESP32 discovery/claim (see app.services.discovered_device_service).
# How long after a claim the device's plaintext key stays fetchable over /devices/announce
# (measured from -- and extended by -- each successful delivery, i.e. an idle timeout).
KEY_DELIVERY_WINDOW_MINUTES = int(os.getenv("KEY_DELIVERY_WINDOW_MINUTES", "15"))
# A discovered-but-unclaimed chip counts as "online" for the superadmin list if it
# announced itself within this window.
DISCOVERED_DEVICE_ONLINE_WINDOW_SECONDS = int(os.getenv("DISCOVERED_DEVICE_ONLINE_WINDOW_SECONDS", "300"))
# /announce is unauthenticated (the ESP32 has no key yet), so it's rate-limited per IP
# the same way login is: a sliding window, not a hard quota.
ANNOUNCE_RATE_LIMIT_MAX = int(os.getenv("ANNOUNCE_RATE_LIMIT_MAX", "20"))
ANNOUNCE_RATE_LIMIT_WINDOW_SECONDS = int(os.getenv("ANNOUNCE_RATE_LIMIT_WINDOW_SECONDS", "60"))

# Minimum client build (Android versionCode / Wear versionCode) allowed to keep working.
# Bump these after shipping a build that older clients must not silently keep using
# (e.g. a breaking API change) — GET /api/v1/meta/version tells clients to self-block.
MOBILE_APP_MIN_VERSION = int(os.getenv("MOBILE_APP_MIN_VERSION", "1"))
WATCH_APP_MIN_VERSION = int(os.getenv("WATCH_APP_MIN_VERSION", "1"))
