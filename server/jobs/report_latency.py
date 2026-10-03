"""Report how fast the alerting path was, and complain when it is not.

The system's whole value is one number: how long a patient waits between
pressing the button and a nurse being told. A review found that number was
recorded nowhere -- it could be measured by hand, and was, but nothing would ever
notice it getting worse. app.core.latency now records it; this is the half that
makes somebody look.

Reads the running API's own in-memory summary over HTTP rather than importing it,
because the samples live in the uvicorn process and this job is a separate one.

    .venv/bin/python -m jobs.report_latency [--dry-run]
"""

import argparse
import logging
import os
import sys

import requests

if __package__ in (None, ""):
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.config import (  # noqa: E402
    LATENCY_P95_BUDGET_MS,
    NTFY_TOPIC_URL,
)
from app.core.security import create_access_token  # noqa: E402
from app.database import SessionLocal  # noqa: E402
from app.models import Staff  # noqa: E402

logger = logging.getLogger("jobs.report_latency")

API_BASE = os.getenv("INTERNAL_API_BASE", "http://127.0.0.1:8002")
HTTP_TIMEOUT_SECONDS = 10

# The route a patient is actually waiting on. Others are timed and reported, but
# this is the one with a budget attached.
INGEST_ROUTE = "/api/v1/calls"

# Below this many samples a percentile is noise, not a measurement. A quiet night
# at a small clinic produces a handful of calls, and alerting on the p95 of six
# requests would teach the reader to ignore this message.
MIN_SAMPLES = 20


def fetch(token: str) -> dict:
    res = requests.get(
        f"{API_BASE}/api/v1/meta/latency",
        headers={"Authorization": f"Bearer {token}"},
        timeout=HTTP_TIMEOUT_SECONDS,
    )
    res.raise_for_status()
    return res.json()


def format_report(snapshot: dict) -> tuple[str, bool]:
    """Returns (message, over_budget)."""
    if not snapshot:
        return "Kechikish o'lchovlari yo'q — server qayta ishga tushganidan beri chaqiruv bo'lmagan.", False

    lines = []
    over = False
    for route in sorted(snapshot):
        s = snapshot[route]
        mark = ""
        if route == INGEST_ROUTE and s["count"] >= MIN_SAMPLES and s["p95_ms"] > LATENCY_P95_BUDGET_MS:
            mark = f"  ← {LATENCY_P95_BUDGET_MS} ms budjetdan oshdi"
            over = True
        lines.append(
            f"{route}\n  {int(s['count'])} ta so'rov · "
            f"p50 {s['p50_ms']:.0f} ms · p95 {s['p95_ms']:.0f} ms · "
            f"eng sekin {s['max_ms']:.0f} ms{mark}"
        )
    return "\n".join(lines), over


def send(message: str, *, urgent: bool) -> bool:
    if not NTFY_TOPIC_URL:
        logger.info("NTFY_TOPIC_URL sozlanmagan — yuborilmadi")
        return False
    try:
        resp = requests.post(
            NTFY_TOPIC_URL,
            data=message.encode("utf-8"),
            headers={
                "Title": "NurseCall: chaqiruv kechikishi" + (" OSHDI" if urgent else ""),
                "Priority": "high" if urgent else "low",
                "Tags": "stopwatch",
            },
            timeout=HTTP_TIMEOUT_SECONDS,
        )
        return resp.status_code < 400
    except requests.RequestException:
        logger.exception("ntfy yuborilmadi")
        return False


def mint_token() -> str | None:
    """A superadmin token, made here and thrown away.

    The first version of this read one from .env. That meant storing a
    long-lived superadmin credential on disk purely so a local job could read a
    page of numbers -- a new secret to rotate, back up and eventually leak.

    This job already runs on the box that holds the signing key and the
    database, so it can simply mint one for the length of the run. Nothing is
    stored, and an attacker who could read this token could read the signing key
    beside it anyway.
    """
    db = SessionLocal()
    try:
        # clinic_id IS NULL is what makes an account platform-level.
        admin = db.query(Staff).filter(Staff.clinic_id.is_(None)).first()
        if admin is None:
            return None
        return create_access_token(
            staff_id=admin.id,
            clinic_id=None,
            role=admin.role.value,
            email=admin.email,
            name=admin.name,
        )
    finally:
        db.close()


def run(dry_run: bool = False) -> int:
    token = mint_token()
    if not token:
        logger.error("Superadmin hisobi topilmadi — o'lchovni o'qib bo'lmaydi")
        return 1

    try:
        snapshot = fetch(token)
    except Exception:
        # A job that cannot read the numbers is not an outage. The uptime check
        # already answers "is the API up", and two alerts for one fact is how
        # people learn to mute both.
        logger.exception("Kechikish o'lchovlarini o'qib bo'lmadi")
        return 1

    message, over = format_report(snapshot)

    if dry_run:
        print(message)
        print(f"\n--- budjetdan oshganmi: {'HA' if over else "yo'q"} ---")
        return 0

    # Sent every day regardless, not only when it is bad: a number that only ever
    # appears alongside the word "problem" is one nobody develops a feel for, and
    # a feel for the normal range is what makes the bad day obvious.
    send(message, urgent=over)
    logger.info("Kechikish hisoboti yuborildi (budjetdan oshgan: %s)", over)
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Chaqiruv yo'lining kechikishi haqida hisobot")
    parser.add_argument("--dry-run", action="store_true", help="yubormasdan chop etadi")
    args = parser.parse_args()
    logging.basicConfig(
        level=os.getenv("LOG_LEVEL", "INFO").upper(),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    return run(dry_run=args.dry_run)


if __name__ == "__main__":
    sys.exit(main())
