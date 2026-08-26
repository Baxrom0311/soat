"""Environment configuration. Loaded once at import time."""

import os
import secrets

from dotenv import load_dotenv

load_dotenv()

# "production" (default) hides the auto-generated Swagger/ReDoc/OpenAPI schema --
# every endpoint's shape (including admin/superadmin routes) is otherwise public to
# anyone who requests /docs. Set ENVIRONMENT=development locally to see it again.
ENVIRONMENT = os.getenv("ENVIRONMENT", "production")

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

# A device counts as online if its last heartbeat/call arrived within this window.
DEVICE_ONLINE_WINDOW_SECONDS = int(os.getenv("DEVICE_ONLINE_WINDOW_SECONDS", "180"))

# Zero-touch ESP32 discovery/claim (see app.services.discovered_device_service).
# How long after a claim the device's plaintext key stays fetchable over /devices/announce.
# Fixed deadline from claim time (Device.created_at) -- NOT extended by repeat calls.
KEY_DELIVERY_WINDOW_MINUTES = int(os.getenv("KEY_DELIVERY_WINDOW_MINUTES", "15"))
# A discovered-but-unclaimed chip counts as "online" for the superadmin list if it
# announced itself within this window.
DISCOVERED_DEVICE_ONLINE_WINDOW_SECONDS = int(os.getenv("DISCOVERED_DEVICE_ONLINE_WINDOW_SECONDS", "300"))
# /announce is unauthenticated (the ESP32 has no key yet), so it's rate-limited per IP
# the same way login is: a sliding window, not a hard quota.
ANNOUNCE_RATE_LIMIT_MAX = int(os.getenv("ANNOUNCE_RATE_LIMIT_MAX", "20"))
ANNOUNCE_RATE_LIMIT_WINDOW_SECONDS = int(os.getenv("ANNOUNCE_RATE_LIMIT_WINDOW_SECONDS", "60"))

# Public landing-page lead capture (POST /api/v1/contact-requests). Unauthenticated,
# so it's rate-limited per IP -- deliberately far tighter than /announce: a real human
# filling in a call-back form has no reason to submit more than a handful an hour.
CONTACT_REQUEST_RATE_LIMIT_MAX = int(os.getenv("CONTACT_REQUEST_RATE_LIMIT_MAX", "5"))
CONTACT_REQUEST_RATE_LIMIT_WINDOW_SECONDS = int(
    os.getenv("CONTACT_REQUEST_RATE_LIMIT_WINDOW_SECONDS", "3600")
)

# Per-clinic ceiling on call ingestion (POST /api/v1/calls), keyed by clinic_id once
# the posting device's key has authenticated it -- a single clinic's misbehaving/
# spoofed device (or a buggy retry loop) can only burn through its OWN budget, never
# another clinic's, so one tenant's traffic can no longer degrade the whole platform.
# Sized generously above any plausible real multi-patient burst (dozens of devices,
# every button pressed within the same few seconds) with real headroom to spare.
# The ESP32 firmware already treats a 429 as a retryable error (queues and retries
# with backoff), so no firmware change is needed to make this safe to enable.
CALL_INGEST_RATE_LIMIT_MAX = int(os.getenv("CALL_INGEST_RATE_LIMIT_MAX", "60"))
CALL_INGEST_RATE_LIMIT_WINDOW_SECONDS = int(os.getenv("CALL_INGEST_RATE_LIMIT_WINDOW_SECONDS", "10"))

# Clinics past their paid-through date keep working for this many days before
# access is actually blocked (billing.is_blocked) -- an abrupt cutoff the instant
# paid_until passes looks like an outage to clinic staff, not a billing issue.
# Manual suspension (subscription_status="suspended") is NOT affected by this and
# still blocks immediately -- the grace period only softens the automatic,
# payment-lapse path.
BILLING_GRACE_PERIOD_DAYS = int(os.getenv("BILLING_GRACE_PERIOD_DAYS", "7"))

# Minimum client build (Android versionCode / Wear versionCode) allowed to keep working.
# Bump these after shipping a build that older clients must not silently keep using
# (e.g. a breaking API change) — GET /api/v1/meta/version tells clients to self-block.
MOBILE_APP_MIN_VERSION = int(os.getenv("MOBILE_APP_MIN_VERSION", "1"))
WATCH_APP_MIN_VERSION = int(os.getenv("WATCH_APP_MIN_VERSION", "1"))
