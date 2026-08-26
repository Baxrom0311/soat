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


def list_recent(db: Session, limit: int = DEFAULT_LIST_LIMIT) -> list[ContactRequest]:
    return contact_request_repo.list_recent(db, limit)


def mark_handled(db: Session, request_id: int) -> ContactRequest:
    row = contact_request_repo.mark_handled(db, request_id)
    if row is None:
        raise HTTPException(status_code=404, detail="So'rov topilmadi")
    db.commit()
    return row
