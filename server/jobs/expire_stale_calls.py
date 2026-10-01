"""Close calls that nobody ever answered.

Nothing in the system ever closed a call. A patient presses a button, a row goes active,
and unless a nurse taps acknowledge it stays active forever -- on her screen, in the
badge count, and in the re-alert job's view of who is still waiting. Measured when this
was written: 28 open calls across four clinics, 22 at one of them, the oldest six days
old. None of those was a patient waiting six days.

So after CALL_EXPIRE_HOURS a call is closed as expired. Not acknowledged -- nobody
acknowledged it -- which keeps the history honest and keeps every answer-time figure,
all of which are computed from acknowledged_at, free of calls nobody answered.

Twelve hours is longer than any shift at these clinics, so an expired call is one that
no shift ever closed, never one a nurse was about to reach.

Driven by nursecall-expire-calls.timer.

    .venv/bin/python -m jobs.expire_stale_calls [--dry-run]
"""

import argparse
import logging
import os
import sys
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

# Run as `python jobs/expire_stale_calls.py` too, not only `python -m jobs...`.
if __package__ in (None, ""):
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.config import CALL_EXPIRE_HOURS  # noqa: E402
from app.database import SessionLocal  # noqa: E402
from app.enums import CallStatus  # noqa: E402
from app.models import Call, Clinic, Room  # noqa: E402
from app.repositories import call_repo  # noqa: E402

logger = logging.getLogger("jobs.expire_stale_calls")


def _doomed(db: Session, cutoff: datetime) -> list[tuple[str, str, int]]:
    """(clinic, room, hours waited) for everything this run would close."""
    rows = (
        db.query(Clinic.name, Room.room_number, Call.created_at)
        .join(Call, Call.clinic_id == Clinic.id)
        .join(Room, Call.room_id == Room.id)
        .filter(Call.status == CallStatus.ACTIVE, Call.created_at < cutoff)
        .order_by(Call.created_at)
        .all()
    )
    now = datetime.now(timezone.utc)
    return [(c, r, int((now - created).total_seconds()) // 3600) for c, r, created in rows]


def run(dry_run: bool = False) -> int:
    cutoff = datetime.now(timezone.utc) - timedelta(hours=CALL_EXPIRE_HOURS)
    db: Session = SessionLocal()
    try:
        if dry_run:
            doomed = _doomed(db, cutoff)
            print(f"--- DRY RUN: {len(doomed)} ta chaqiruv yopilardi " f"({CALL_EXPIRE_HOURS} soatdan oshgan) ---")
            for clinic, room, hours in doomed:
                print(f"  {clinic}: xona {room} — {hours} soat kutgan")
            return 0

        closed = call_repo.expire_stale(db, older_than=cutoff)
        db.commit()
    except Exception:
        # An unreachable DB means this run did nothing, which is safe: the next run
        # sees exactly the same rows. Non-zero so the timer's failure is visible.
        db.rollback()
        logger.exception("Eski chaqiruvlarni yopish muvaffaqiyatsiz tugadi")
        return 1
    finally:
        db.close()

    if closed:
        logger.warning(
            "Javobsiz qolgan %d ta chaqiruv yopildi (%d soatdan oshgan)",
            closed,
            CALL_EXPIRE_HOURS,
        )
    else:
        logger.info("Yopiladigan eski chaqiruv yo'q")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Javobsiz qolgan eski chaqiruvlarni yopadi")
    parser.add_argument("--dry-run", action="store_true", help="yopmasdan faqat ro'yxatini chop etadi")
    args = parser.parse_args()

    logging.basicConfig(
        level=os.getenv("LOG_LEVEL", "INFO").upper(),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    return run(dry_run=args.dry_run)


if __name__ == "__main__":
    sys.exit(main())
