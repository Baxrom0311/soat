"""Keep alerting while a patient is still waiting.

The first notification goes out the instant the button is pressed, and then
nothing. A phone in a pocket, a nurse mid-task, a handset face-down on a desk --
any of those and the alert is spent. The clinic with the worst response times in
production answered half its calls in bursts, hours later, which is what that
looks like from the data side.

So this is the alarm half: a call that nobody has acknowledged re-announces
itself until somebody does. Driven by nursecall-renotify.timer, once a minute.

Server-side rather than in the app on purpose. The case that matters most is the
one where the app is backgrounded, asleep or killed -- exactly when an in-app
timer is not running. The server always knows which calls are still waiting.

    .venv/bin/python -m jobs.renotify_waiting_calls [--dry-run]
"""

import argparse
import logging
import os
import sys
from datetime import datetime, timezone

from sqlalchemy.orm import Session

# Run as `python jobs/renotify_waiting_calls.py` too, not only `python -m jobs...`.
if __package__ in (None, ""):
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.config import (  # noqa: E402
    RENOTIFY_AFTER_SECONDS,
    RENOTIFY_MAX_HOURS,
    RENOTIFY_SLOW_AFTER_MINUTES,
    RENOTIFY_SLOW_EVERY_MINUTES,
)
from app.database import SessionLocal  # noqa: E402
from app.repositories import clinic_repo, call_repo  # noqa: E402
from app.services import push_service  # noqa: E402

logger = logging.getLogger("jobs.renotify_waiting_calls")

CLINIC_PAGE_SIZE = 500


def should_renotify(waited_seconds: int) -> bool:
    """Whether this minute is a re-alert minute for a call of this age.

    Stateless: the decision comes from the call's age, so nothing has to be
    recorded and a missed run cannot leave a patient silently dropped.

    Every minute at first, because the first few minutes are when a nurse can
    still be reached before it matters. After RENOTIFY_SLOW_AFTER_MINUTES it
    drops to one in RENOTIFY_SLOW_EVERY_MINUTES -- a phone that has buzzed
    fifteen times already is not going to be answered by the sixteenth, and an
    alert that never relents is one people learn to silence.

    It does stop eventually, at RENOTIFY_MAX_HOURS. Not because the patient stops
    mattering, but because a call left open for hours is a record nobody closed
    rather than somebody still waiting -- acknowledging is a button press made
    after the fact, and often not at all. Shouting about those would bury the
    calls that are real.
    """
    if waited_seconds < RENOTIFY_AFTER_SECONDS:
        return False
    if waited_seconds > RENOTIFY_MAX_HOURS * 3600:
        return False
    minutes = waited_seconds // 60
    if minutes < RENOTIFY_SLOW_AFTER_MINUTES:
        return True
    return minutes % RENOTIFY_SLOW_EVERY_MINUTES == 0


def collect(db: Session, now: datetime) -> list[dict]:
    due: list[dict] = []
    offset = 0
    while True:
        clinics = clinic_repo.list_all(db, limit=CLINIC_PAGE_SIZE, offset=offset)
        if not clinics:
            break
        for clinic in clinics:
            for call, room in call_repo.list_active_with_room_by_clinic(db, clinic.id):
                waited = int((now - call.created_at).total_seconds())
                if not should_renotify(waited):
                    continue
                due.append(
                    {
                        "clinic_id": clinic.id,
                        "clinic": clinic.name,
                        "call_id": call.id,
                        "room_number": room.room_number,
                        "floor": room.floor,
                        "waited": waited,
                    }
                )
        offset += CLINIC_PAGE_SIZE
    return due


def run(dry_run: bool = False) -> int:
    now = datetime.now(timezone.utc)
    db: Session = SessionLocal()
    try:
        due = collect(db, now)
    except Exception:
        # An unreachable DB is the one condition worth a non-zero exit: the run
        # produced no answer at all rather than an answer nobody could deliver.
        logger.exception("Faol chaqiruvlarni o'qish muvaffaqiyatsiz tugadi")
        return 1
    finally:
        db.close()

    if not due:
        logger.info("Javob kutayotgan chaqiruv yo'q — qayta xabar yuborilmadi")
        return 0

    if dry_run:
        print(f"--- DRY RUN: {len(due)} ta qayta xabar yuborilardi ---")
        for row in due:
            print(
                f"  {row['clinic']}: xona {row['room_number']} "
                f"({row['floor']}-qavat) — {row['waited'] // 60} daqiqa"
            )
        return 0

    for row in due:
        # Reuses the ordinary send path, so a repeat reaches both app generations
        # by exactly the same routing as the first alert. Each failure is already
        # swallowed in there; one clinic's dead token must not stop the next
        # clinic's nurse being told.
        push_service.send_new_call_notifications(
            row["clinic_id"],
            call_id=row["call_id"],
            room_number=row["room_number"],
            floor=row["floor"],
            waited_seconds=row["waited"],
        )

    logger.info("Qayta xabar yuborildi: %d ta chaqiruv", len(due))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Javob berilmagan chaqiruvlar haqida qayta xabar yuboradi"
    )
    parser.add_argument(
        "--dry-run", action="store_true", help="xabarni yubormasdan faqat chop etadi"
    )
    args = parser.parse_args()

    logging.basicConfig(
        level=os.getenv("LOG_LEVEL", "INFO").upper(),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    return run(dry_run=args.dry_run)


if __name__ == "__main__":
    sys.exit(main())
