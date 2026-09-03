"""Public landing-page lead capture.

A prospective clinic owner fills in the marketing page's call-back form and it lands
here over an unauthenticated POST. Because there is no credential to throttle on, the
submitting IP is rate-limited and every field is length-capped -- otherwise this is a
free write path into the production database for anyone on the internet.
"""

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.config import (
    CONTACT_REQUEST_RATE_LIMIT_MAX,
    CONTACT_REQUEST_RATE_LIMIT_WINDOW_SECONDS,
)
from app.core.rate_limit import SlidingWindowLimiter
from app.models import ContactRequest
from app.repositories import contact_request_repo

NAME_MIN_LENGTH = 2
NAME_MAX_LENGTH = 100
PHONE_MIN_LENGTH = 5
PHONE_MAX_LENGTH = 32
CLINIC_NAME_MAX_LENGTH = 200
MESSAGE_MAX_LENGTH = 2000
DEFAULT_LIST_LIMIT = 100

_submit_limiter = SlidingWindowLimiter(
    max_events=CONTACT_REQUEST_RATE_LIMIT_MAX,
    window_seconds=CONTACT_REQUEST_RATE_LIMIT_WINDOW_SECONDS,
)


def _clean_optional(value: str | None, *, max_length: int, field_label: str) -> str | None:
    if value is None:
        return None
    value = value.strip()
    if not value:
        return None
    if len(value) > max_length:
        raise HTTPException(
            status_code=422, detail=f"{field_label} {max_length} belgidan oshmasligi kerak"
        )
    return value


def submit(
    db: Session,
    *,
    name: str,
    phone: str,
    clinic_name: str | None,
    message: str | None,
    client_ip: str,
) -> None:
    if not _submit_limiter.check(client_ip):
        raise HTTPException(
            status_code=429,
            detail="So'rovlar juda ko'p yuborildi. Iltimos, keyinroq qayta urinib ko'ring",
        )

    name = name.strip()
    if not (NAME_MIN_LENGTH <= len(name) <= NAME_MAX_LENGTH):
        raise HTTPException(
            status_code=422,
            detail=f"Ism {NAME_MIN_LENGTH} dan {NAME_MAX_LENGTH} belgigacha bo'lishi kerak",
        )

    phone = phone.strip()
    if not (PHONE_MIN_LENGTH <= len(phone) <= PHONE_MAX_LENGTH):
        raise HTTPException(
            status_code=422,
            detail=f"Telefon raqami {PHONE_MIN_LENGTH} dan {PHONE_MAX_LENGTH} belgigacha bo'lishi kerak",
        )

    clinic_name = _clean_optional(
        clinic_name, max_length=CLINIC_NAME_MAX_LENGTH, field_label="Klinika nomi"
    )
    message = _clean_optional(message, max_length=MESSAGE_MAX_LENGTH, field_label="Xabar")

    contact_request_repo.create(
        db,
        name=name,
        phone=phone,
        clinic_name=clinic_name,
        message=message,
        source_ip=client_ip,
    )
    db.commit()

    # Telegram bot forwarding (if configured in environment)
    _send_telegram_notification(
        name=name,
        phone=phone,
        clinic_name=clinic_name,
        message=message,
        client_ip=client_ip,
    )


def _send_telegram_notification(
    *,
    name: str,
    phone: str,
    clinic_name: str | None,
    message: str | None,
    client_ip: str,
) -> None:
    from app.core.config import TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID

    if not (TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID):
        return

    import json
    import urllib.request

    text = (
        f"📩 <b>Yangi Konsultatsiya So'rovi!</b>\n\n"
        f"👤 <b>Ism/Klinika:</b> {name}\n"
        f"📞 <b>Tel:</b> {phone}\n"
        f"🏥 <b>Klinika:</b> {clinic_name or '-'}\n"
        f"💬 <b>Izoh:</b> {message or '-'}\n"
        f"🌐 <b>IP:</b> {client_ip}"
    )

    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    payload = {
        "chat_id": TELEGRAM_CHAT_ID,
        "text": text,
        "parse_mode": "HTML",
    }

    try:
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=5):
            pass
    except Exception:
        # Never fail lead capture DB save if Telegram API call times out
        pass


def list_recent(db: Session, limit: int = DEFAULT_LIST_LIMIT) -> list[ContactRequest]:
    return contact_request_repo.list_recent(db, limit)


def mark_handled(db: Session, request_id: int) -> ContactRequest:
    row = contact_request_repo.mark_handled(db, request_id)
    if row is None:
        raise HTTPException(status_code=404, detail="So'rov topilmadi")
    db.commit()
    return row
