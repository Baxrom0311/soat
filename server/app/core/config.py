"""Environment configuration. Loaded once at import time."""

import os
import secrets

from dotenv import load_dotenv

load_dotenv()

# "production" (default) hides the auto-generated Swagger/ReDoc/OpenAPI schema --
# every endpoint's shape (including admin/superadmin routes) is otherwise public to
# anyone who requests /docs. Set ENVIRONMENT=development locally to see it again.
ENVIRONMENT = os.getenv("ENVIRONMENT", "production")

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+psycopg://baxrom@127.0.0.1:5432/soat_nursecall")

# JWT_SECRET should be set in .env for prod; a random one is fine for a single dev-server run
# (it just means tokens become invalid if the process restarts without a fixed secret).
JWT_SECRET = os.getenv("JWT_SECRET") or secrets.token_hex(32)
if not os.getenv("JWT_SECRET"):
    import logging

    logging.getLogger(__name__).warning(
        "JWT_SECRET is not set — using a random per-process secret; "
        "all tokens will be invalidated on restart and multi-worker deployments will not work"
    )
# Accepted for verification but never used to sign. This is what makes rotating the
# signing key a non-event: set the old secret here, put a fresh one in JWT_SECRET, and
# every token already in a nurse's pocket keeps working until it expires on its own
# while every new token is signed with the key nobody else has. Clear it once the
# longest-lived old token has aged out -- leaving it set forever would mean a leaked key
# never actually stops working, which is the thing the rotation was for.
JWT_SECRET_OLD = os.getenv("JWT_SECRET_OLD", "")

# Secret under which device API keys are HMAC'd. Independent of JWT_SECRET on
# purpose: rotating the token-signing key must not invalidate every receiver in
# every clinic. Empty means device keys keep using bcrypt, so a missing value
# degrades to the old behaviour rather than locking the fleet out.
DEVICE_KEY_SECRET = os.getenv("DEVICE_KEY_SECRET", "")

JWT_ALGORITHM = "HS256"

# Ninety days, down from a year. The shorter this is, the shorter a stolen phone stays
# useful to whoever took it -- but every expiry is a nurse locked out mid-shift and a
# ward watch that has to be paired again by hand, so it cannot simply be made small.
# Ninety is roughly the longest window that is still meaningfully bounded. Getting below
# it needs refresh tokens, so that renewal stops being a login the nurse has to perform.
JWT_EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", str(90 * 24 * 60)))

# A device counts as online if its last heartbeat/call arrived within this window.
DEVICE_ONLINE_WINDOW_SECONDS = int(os.getenv("DEVICE_ONLINE_WINDOW_SECONDS", "180"))

# Zero-touch ESP32 discovery/claim (see app.services.discovered_device_service).
# How long after a claim the device's plaintext key stays fetchable over /devices/announce.
# Fixed deadline from claim time (Device.created_at) -- NOT extended by repeat calls.
KEY_DELIVERY_WINDOW_MINUTES = int(os.getenv("KEY_DELIVERY_WINDOW_MINUTES", "15"))
# A discovered-but-unclaimed chip counts as "online" for the superadmin list if it
# announced itself within this window.
DISCOVERED_DEVICE_ONLINE_WINDOW_SECONDS = int(os.getenv("DISCOVERED_DEVICE_ONLINE_WINDOW_SECONDS", "300"))

# How long a receiver must be silent before the vendor is paged. Deliberately far longer
# than DEVICE_ONLINE_WINDOW_SECONDS above: that 3-minute window answers "is this device
# online right now?" for the dashboard, where being twitchy costs nothing. An alert that
# fires on a 3-minute wifi blip trains the reader to ignore it, so this waits for 20
# missed heartbeats (the ESP32 sends one a minute) before calling it an outage.
DEVICE_OFFLINE_ALERT_MINUTES = int(os.getenv("DEVICE_OFFLINE_ALERT_MINUTES", "20"))
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
BILLING_GRACE_PERIOD_DAYS = int(os.getenv("BILLING_GRACE_PERIOD_DAYS", "3"))

# How far ahead of paid_until the expiry warning starts appearing (clinic side) and
# alerting (vendor side). The point is to collect the payment BEFORE the due date, so
# the grace window and the cutoff are never reached at all -- by the time a clinic is
# overdue the conversation is already an awkward one.
BILLING_WARN_BEFORE_DAYS = int(os.getenv("BILLING_WARN_BEFORE_DAYS", "5"))

# Vendor identity printed on the clinic-facing bill (GET /api/v1/clinic/bill).
# All empty by default and the template omits any empty block: there is no registered
# legal entity yet, so the page must stay a plain bill ("Hisob") and must not print
# blank "STIR:" style labels that would make it look like an incomplete invoice.
# Fill these in via env once the entity and bank account exist.
VENDOR_LEGAL_NAME = os.getenv("VENDOR_LEGAL_NAME", "")
VENDOR_TAX_ID = os.getenv("VENDOR_TAX_ID", "")
VENDOR_BANK_DETAILS = os.getenv("VENDOR_BANK_DETAILS", "")
VENDOR_ADDRESS = os.getenv("VENDOR_ADDRESS", "")
# The one contact detail that is already known and stable.
VENDOR_PHONE = os.getenv("VENDOR_PHONE", "+998935580311")

# Vendor-facing alert channels for the daily expiry-warning job
# (jobs/check_expiring_subscriptions.py). Both are individually optional: whichever is
# configured gets the message, and an unconfigured channel is simply skipped -- so the
# job can ship and start warning over ntfy before a Telegram bot exists.
# Firebase service-account JSON for FCM HTTP v1. Empty == FCM disabled, and the push
# service then serves only Expo tokens. Kept as a path rather than inline JSON so the
# private key never sits in an env var that shows up in `systemctl show` or a crash dump.
# How long a call may go unacknowledged before it starts re-announcing itself. The
# first alert goes out at the button press; this is the gap before the second.
# The service level this system is actually promising: 95% of button presses
# turn into a recorded call within this long. Measured end to end from a laptop
# over TLS the real figure sat around 1s with a worst case of 1.6s, so 2000ms is
# a ceiling that normal operation stays well under and a genuine regression
# breaks. Declaring it is the point -- an unstated target cannot be missed.
LATENCY_P95_BUDGET_MS = int(os.getenv("LATENCY_P95_BUDGET_MS", "2000"))

RENOTIFY_AFTER_SECONDS = int(os.getenv("RENOTIFY_AFTER_SECONDS", "60"))
# After this many minutes the repeat slows down. A phone that has buzzed fifteen times
# will not be answered by the sixteenth, and an alert that never relents is one people
# learn to silence -- which costs more than the repeat gains.
RENOTIFY_SLOW_AFTER_MINUTES = int(os.getenv("RENOTIFY_SLOW_AFTER_MINUTES", "15"))
RENOTIFY_SLOW_EVERY_MINUTES = int(os.getenv("RENOTIFY_SLOW_EVERY_MINUTES", "5"))
# Past this, stop. A call still "active" after hours is not a patient waiting -- it is a
# record nobody closed, because acknowledging is a button press a nurse makes after the
# fact and often not at all. Measured when this was written: of 28 open calls across four
# clinics, exactly one was under two hours old and eighteen were over a day, the oldest
# six days. Re-alerting those would have meant hundreds of pushes an hour about patients
# long since seen -- and an app that cries wolf on day one is uninstalled by day two.
RENOTIFY_MAX_HOURS = int(os.getenv("RENOTIFY_MAX_HOURS", "2"))

# When a call nobody acknowledged stops counting as waiting and is closed as expired
# (jobs/expire_stale_calls.py). Deliberately far beyond RENOTIFY_MAX_HOURS: the repeat
# alerts stopping is a judgement about what is worth buzzing a phone over, while this is
# a judgement about what is still true, and the second must be the more conservative of
# the two. Twelve hours is longer than any shift at these clinics, so a call that expires
# is one no shift ever closed -- never one a nurse was about to get to. The expired rows
# stay in history, and are exactly the number worth reporting to a clinic.
CALL_EXPIRE_HOURS = int(os.getenv("CALL_EXPIRE_HOURS", "12"))

FCM_SERVICE_ACCOUNT_FILE = os.getenv("FCM_SERVICE_ACCOUNT_FILE", "")

NTFY_TOPIC_URL = os.getenv("NTFY_TOPIC_URL", "")
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID", "")

# Minimum client build (Android versionCode / Wear versionCode) allowed to keep working.
# Bump these after shipping a build that older clients must not silently keep using
# (e.g. a breaking API change) — GET /api/v1/meta/version tells clients to self-block.
MOBILE_APP_MIN_VERSION = int(os.getenv("MOBILE_APP_MIN_VERSION", "1"))
WATCH_APP_MIN_VERSION = int(os.getenv("WATCH_APP_MIN_VERSION", "1"))
