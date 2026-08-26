"""Daily vendor-facing alert for clinics whose subscription is about to lapse (or has
lapsed but is still inside the grace window).

Driven by nursecall-billing-warn.timer. Read-only: it opens its own session, picks the
clinics billing.needs_expiry_warning() flags, and sends ONE summary message to ntfy and
to Telegram. Whether a clinic should be warned is never decided here -- app.core.billing
is the single source of truth.

Nothing but an unreachable DB may fail the run: a dead ntfy host must not stop the
Telegram message, and neither must make the systemd unit look broken.

    .venv/bin/python -m jobs.check_expiring_subscriptions [--dry-run]
"""

import argparse
import logging
import os
import sys
from datetime import datetime, timezone

import requests
from sqlalchemy.orm import Session

# Run as `python jobs/check_expiring_subscriptions.py` too, not only `python -m jobs...`:
# in the direct-file form sys.path[0] is jobs/, so the project root has to be added.
if __package__ in (None, ""):
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core import billing  # noqa: E402
from app.core.config import NTFY_TOPIC_URL, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
from app.database import SessionLocal
from app.repositories import clinic_repo, device_repo, plan_repo

logger = logging.getLogger("jobs.check_expiring_subscriptions")

HTTP_TIMEOUT_SECONDS = 15

# list_all() is paginated for the superadmin UI; the job wants every clinic, and this is
# a few hundred rows at the very most.
CLINIC_PAGE_SIZE = 500


def _collect(db: Session, now: datetime) -> list[dict]:
    plans = plan_repo.get_map(db)
    device_counts = device_repo.count_by_clinic(db)

    warnings: list[dict] = []
    offset = 0
    while True:
        clinics = clinic_repo.list_all(db, limit=CLINIC_PAGE_SIZE, offset=offset)
        if not clinics:
            break
        for clinic in clinics:
            if not billing.needs_expiry_warning(clinic, now):
                continue
            plan = plans.get(clinic.plan_id) if clinic.plan_id else None
            device_count = device_counts.get(clinic.id, 0)
            warnings.append(
                {
                    "name": clinic.name,
                    "days_left": billing.days_until_expiry(clinic, now),
                    "blocked_at": billing.blocked_at(clinic),
                    "amount": billing.effective_price(clinic, plan, device_count, now),
                    "currency": plan.currency if plan else "UZS",
                    "devices": device_count,
                }
            )
        offset += CLINIC_PAGE_SIZE

    warnings.sort(key=lambda row: (row["days_left"] if row["days_left"] is not None else 0))
    return warnings


def _format_amount(amount: int | None, currency: str) -> str:
    if amount is None:
        return "summa belgilanmagan"
    return f"{amount:,}".replace(",", " ") + f" {currency}"


def _format_deadline(moment: datetime | None) -> str:
    if moment is None:
        return "noma'lum"
    return moment.strftime("%d.%m.%Y")


def _format_days(days_left: int | None) -> str:
    if days_left is None:
        return "muddat noma'lum"
    if days_left < 0:
        return f"{abs(days_left)} kun kechikdi"
    if days_left == 0:
        return "bugun tugaydi"
    return f"{days_left} kun qoldi"


def build_message(warnings: list[dict]) -> str:
    lines = [f"To'lov muddati yaqinlashgan klinikalar: {len(warnings)} ta", ""]
    for row in warnings:
        lines.append(f"• {row['name']} — {_format_days(row['days_left'])}")
        lines.append(
            f"  Kirish to'xtatiladi: {_format_deadline(row['blocked_at'])}"
            f" | To'lov: {_format_amount(row['amount'], row['currency'])}"
            f" | Qurilma: {row['devices']} ta"
        )
    lines.append("")
    lines.append("Muddat tugashidan oldin klinikaga qo'ng'iroq qiling.")
    return "\n".join(lines)


def _send_ntfy(message: str) -> None:
    if not NTFY_TOPIC_URL:
        logger.info("NTFY_TOPIC_URL sozlanmagan — ntfy o'tkazib yuborildi")
        return
    try:
        resp = requests.post(
            NTFY_TOPIC_URL,
            data=message.encode("utf-8"),
            headers={
                "Title": "NurseCall: to'lov muddati",
                "Priority": "high",
                "Tags": "warning,moneybag",
            },
            timeout=HTTP_TIMEOUT_SECONDS,
        )
        if resp.status_code >= 400:
            logger.warning("ntfy xatolik qaytardi: status=%s body=%s", resp.status_code, resp.text)
        else:
            logger.info("ntfy yuborildi (status=%s)", resp.status_code)
    except requests.RequestException:
        logger.exception("ntfy yuborilmadi")


def _send_telegram(message: str) -> None:
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        logger.info("TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID sozlanmagan — Telegram o'tkazib yuborildi")
        return
    try:
        resp = requests.post(
            f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
            json={
                "chat_id": TELEGRAM_CHAT_ID,
                "text": message,
                "disable_web_page_preview": True,
            },
            timeout=HTTP_TIMEOUT_SECONDS,
        )
        if resp.status_code >= 400:
            # Telegram puts the reason (bad token, unknown chat) in the body, and the
            # token must never reach the log.
            logger.warning("Telegram xatolik qaytardi: status=%s body=%s", resp.status_code, resp.text)
        else:
            logger.info("Telegram yuborildi (status=%s)", resp.status_code)
    except requests.RequestException:
        logger.exception("Telegram yuborilmadi")


def notify(message: str) -> None:
    if not NTFY_TOPIC_URL and not (TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID):
        logger.warning(
            "Hech qanday xabar kanali sozlanmagan (NTFY_TOPIC_URL, TELEGRAM_BOT_TOKEN/"
            "TELEGRAM_CHAT_ID) — ogohlantirish yuborilmadi"
        )
        return
    _send_ntfy(message)
    _send_telegram(message)


def run(dry_run: bool = False) -> int:
    now = datetime.now(timezone.utc)
    db: Session = SessionLocal()
    try:
        warnings = _collect(db, now)
    except Exception:
        # The DB being unreachable is the one condition worth a non-zero exit: it means
        # the run produced no answer at all, rather than an answer nobody could deliver.
        logger.exception("Klinikalarni o'qish muvaffaqiyatsiz tugadi")
        return 1
    finally:
        db.close()

    if not warnings:
        logger.info("To'lov muddati yaqinlashgan klinika yo'q — xabar yuborilmadi")
        return 0

    message = build_message(warnings)
    if dry_run:
        print("--- DRY RUN: yuborilmaydi ---")
        print(message)
        print("--- kanallar ---")
        print(f"ntfy: {'sozlangan' if NTFY_TOPIC_URL else 'sozlanmagan'}")
        print(
            "telegram: "
            + ("sozlangan" if TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID else "sozlanmagan")
        )
        return 0

    notify(message)
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Muddati tugayotgan obunalar haqida vendorga ogohlantirish yuboradi"
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
