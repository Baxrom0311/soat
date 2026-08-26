"""DB access for the ContactRequest table (public landing-page lead capture)."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import ContactRequest


def create(
    db: Session,
    *,
    name: str,
    phone: str,
    clinic_name: str | None,
    message: str | None,
    source_ip: str | None,
) -> ContactRequest:
    row = ContactRequest(
        name=name,
        phone=phone,
        clinic_name=clinic_name,
        message=message,
        source_ip=source_ip,
    )
    db.add(row)
    db.flush()
    return row


def list_recent(db: Session, limit: int) -> list[ContactRequest]:
    return list(
        db.scalars(
            select(ContactRequest).order_by(ContactRequest.created_at.desc()).limit(limit)
        ).all()
    )


def mark_handled(db: Session, request_id: int) -> ContactRequest | None:
    row = db.get(ContactRequest, request_id)
    if row is None:
        return None
    row.handled = True
    db.flush()
    return row
