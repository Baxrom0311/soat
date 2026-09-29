"""Vendor-facing alert for receivers that have stopped heartbeating.

A dead ESP32 is invisible: the clinic sees a dashboard with no calls on it, which looks
exactly like a quiet ward. Nobody finds out until a patient presses a button and nothing
happens. When this job was written, one clinic (three receivers) had been completely
without coverage for three and a half days and neither the vendor nor the clinic knew.

Driven by nursecall-device-offline.timer. Writes exactly one column: devices
.offline_alerted_at, which is this job's memory of what it has already reported.

    .venv/bin/python -m jobs.check_offline_devices [--dry-run]
"""

import argparse
import logging
import os
import sys
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

import requests
from sqlalchemy.orm import Session

# Run as `python jobs/check_offline_devices.py` too, not only `python -m jobs...`:
# in the direct-file form sys.path[0] is jobs/, so the project root has to be added.
if __package__ in (None, ""):
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.config import (  # noqa: E402
    DEVICE_OFFLINE_ALERT_MINUTES,
    NTFY_TOPIC_URL,
    TELEGRAM_BOT_TOKEN,
    TELEGRAM_CHAT_ID,
)
from app.database import SessionLocal  # noqa: E402
from app.repositories import device_repo  # noqa: E402

logger = logging.getLogger("jobs.check_offline_devices")

HTTP_TIMEOUT_SECONDS = 15


@dataclass
class ClinicOutage:
    name: str
    total: int
    whole_clinic: bool
    newly_silent: list[tuple[str, int, float]] = field(default_factory=list)
    never_connected: list[tuple[str, int]] = field(default_factory=list)


def _days_silent(last_seen: datetime, now: datetime) -> float:
    return (now - last_seen).total_seconds() / 86400


def _format_silence(days: float) -> str:
    if days < 1 / 24:
        return f"{int(days * 1440)} daqiqa jim"
    if days < 1:
        return f"{days * 24:.1f} soat jim"
    return f"{days:.1f} kun jim"


def collect(db: Session, now: datetime) -> tuple[list[ClinicOutage], list[tuple[str, str, int]]]:
    """Returns (outages to report, recoveries to report).

    A device is counted as an outage only if it has been silent past the threshold AND
    has not already been reported. Recoveries are the mirror: previously reported and
    heartbeating again.
    """
    cutoff = now - timedelta(minutes=DEVICE_OFFLINE_ALERT_MINUTES)
    fleet = device_repo.list_all_with_clinic_name(db)

    by_clinic: dict[int, list[tuple]] = {}
    for device, clinic_name in fleet:
        by_clinic.setdefault(device.clinic_id, []).append((device, clinic_name))

    outages: list[ClinicOutage] = []
    recoveries: list[tuple[str, str, int]] = []

    for devices in by_clinic.values():
        clinic_name = devices[0][1]
        alive = [d for d, _ in devices if d.last_seen_at is not None and d.last_seen_at >= cutoff]
        silent = [d for d, _ in devices if d.last_seen_at is not None and d.last_seen_at < cutoff]
        never = [d for d, _ in devices if d.last_seen_at is None]

        for device in alive:
            if device.offline_alerted_at is not None:
                recoveries.append((clinic_name, device.device_id, device.floor))

        # "Whole clinic down" only counts when the clinic HAS working coverage to lose.
        # A clinic whose receivers were registered but never installed was never up, so
        # reporting it as an outage would page the vendor forever about a setup task.
        ever_connected = bool(silent) or bool(alive)
        whole_clinic = ever_connected and not alive

        unreported = [d for d in silent if d.offline_alerted_at is None]
        if not unreported:
            continue

        outages.append(
            ClinicOutage(
                name=clinic_name,
                total=len(devices),
                whole_clinic=whole_clinic,
                newly_silent=[
                    (d.device_id, d.floor, _days_silent(d.last_seen_at, now)) for d in unreported
                ],
                # Listed for context inside a clinic that is already being reported --
                # never a trigger on their own.
                never_connected=[(d.device_id, d.floor) for d in never] if whole_clinic else [],
            )
        )

    outages.sort(key=lambda o: (not o.whole_clinic, o.name))
    return outages, recoveries


def build_message(outages: list[ClinicOutage], recoveries: list[tuple[str, str, int]]) -> str:
    lines: list[str] = []

    if outages:
        down = sum(1 for o in outages if o.whole_clinic)
        if down:
            lines.append(f"DIQQAT: {down} ta klinikada qabul qilgich umuman ishlamayapti")
        else:
            lines.append(f"Qabul qilgich ulanmay qoldi: {len(outages)} ta klinikada")
        lines.append("")

        for outage in outages:
            if outage.whole_clinic:
                lines.append(
                    f"[!] {outage.name} — BUTUNLAY ISHLAMAYAPTI"
                    f" ({outage.total} tadan hech biri ulanmagan)"
                )
            else:
                lines.append(f"[-] {outage.name} — {outage.total} tadan {len(outage.newly_silent)} tasi uzildi")
            for device_id, floor, days in outage.newly_silent:
                lines.append(f"    {device_id} ({floor}-qavat) — {_format_silence(days)}")
            for device_id, floor in outage.never_connected:
                lines.append(f"    {device_id} ({floor}-qavat) — hech qachon ulanmagan")
            lines.append("")

    if recoveries:
        lines.append("Qayta ulandi:")
        for clinic_name, device_id, floor in recoveries:
            lines.append(f"    {clinic_name} — {device_id} ({floor}-qavat)")
        lines.append("")

    if outages:
        lines.append("Klinikaga qo'ng'iroq qiling: qurilma tokda yoki WiFi'da muammo bo'lishi mumkin.")
    return "\n".join(lines).rstrip()


def _send_ntfy(message: str, *, urgent: bool) -> bool:
    if not NTFY_TOPIC_URL:
        logger.info("NTFY_TOPIC_URL sozlanmagan — ntfy o'tkazib yuborildi")
        return False
    try:
        resp = requests.post(
            NTFY_TOPIC_URL,
            data=message.encode("utf-8"),
            headers={
                "Title": "NurseCall: qurilma ulanmadi",
                "Priority": "urgent" if urgent else "high",
                "Tags": "rotating_light" if urgent else "warning",
            },
            timeout=HTTP_TIMEOUT_SECONDS,
        )
        if resp.status_code >= 400:
            logger.warning("ntfy xatolik qaytardi: status=%s body=%s", resp.status_code, resp.text)
            return False
        logger.info("ntfy yuborildi (status=%s)", resp.status_code)
        return True
    except requests.RequestException:
        logger.exception("ntfy yuborilmadi")
        return False


def _send_telegram(message: str) -> bool:
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        logger.info("TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID sozlanmagan — Telegram o'tkazib yuborildi")
        return False
    try:
        resp = requests.post(
            f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
            json={"chat_id": TELEGRAM_CHAT_ID, "text": message, "disable_web_page_preview": True},
            timeout=HTTP_TIMEOUT_SECONDS,
        )
        if resp.status_code >= 400:
            # Telegram puts the reason (bad token, unknown chat) in the body, and the
            # token must never reach the log.
            logger.warning("Telegram xatolik qaytardi: status=%s body=%s", resp.status_code, resp.text)
            return False
        logger.info("Telegram yuborildi (status=%s)", resp.status_code)
        return True
    except requests.RequestException:
        logger.exception("Telegram yuborilmadi")
        return False


def notify(message: str, *, urgent: bool) -> bool:
    """True when at least one channel accepted the message.

    The caller only records an outage as reported once this says yes: marking it
    delivered when nothing was delivered would lose the alert permanently, and a repeat
    alert is far cheaper than a silent ward nobody hears about.
    """
    if not NTFY_TOPIC_URL and not (TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID):
        logger.warning(
            "Hech qanday xabar kanali sozlanmagan (NTFY_TOPIC_URL, TELEGRAM_BOT_TOKEN/"
            "TELEGRAM_CHAT_ID) — ogohlantirish yuborilmadi"
        )
        return False
    sent_ntfy = _send_ntfy(message, urgent=urgent)
    sent_telegram = _send_telegram(message)
    return sent_ntfy or sent_telegram


def run(dry_run: bool = False) -> int:
    now = datetime.now(timezone.utc)
    db: Session = SessionLocal()
    try:
        try:
            outages, recoveries = collect(db, now)
        except Exception:
            # An unreachable DB is the one condition worth a non-zero exit: the run
            # produced no answer at all, rather than an answer nobody could deliver.
            logger.exception("Qurilmalarni o'qish muvaffaqiyatsiz tugadi")
            return 1

        if not outages and not recoveries:
            logger.info("Hamma qabul qilgich ulangan — xabar yuborilmadi")
            return 0

        message = build_message(outages, recoveries)
        urgent = any(o.whole_clinic for o in outages)

        if dry_run:
            print("--- DRY RUN: yuborilmaydi, baza o'zgarmaydi ---")
            print(message)
            print("--- kanallar ---")
            print(f"ntfy: {'sozlangan' if NTFY_TOPIC_URL else 'sozlanmagan'}")
            print(
                "telegram: "
                + ("sozlangan" if TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID else "sozlanmagan")
            )
            print(f"muhimlik: {'shoshilinch' if urgent else 'oddiy'}")
            return 0

        if not notify(message, urgent=urgent):
            # Nothing was delivered, so nothing is recorded as reported: the next run
            # tries again instead of going quiet about an outage the vendor never saw.
            logger.warning("Xabar yetkazilmadi — holat o'zgartirilmadi, keyingi urinishda qayta sinaladi")
            return 0

        cutoff = now - timedelta(minutes=DEVICE_OFFLINE_ALERT_MINUTES)
        for device, _ in device_repo.list_all_with_clinic_name(db):
            alive = device.last_seen_at is not None and device.last_seen_at >= cutoff
            silent = device.last_seen_at is not None and device.last_seen_at < cutoff
            if silent and device.offline_alerted_at is None:
                device_repo.mark_offline_alerted(db, device, now=now)
            elif alive and device.offline_alerted_at is not None:
                device_repo.clear_offline_alerted(db, device)
        db.commit()
        return 0
    finally:
        db.close()


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Ulanmay qolgan qabul qilgichlar haqida vendorga ogohlantirish yuboradi"
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
