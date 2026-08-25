"""DB access for the Payment table."""

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Payment


def create(
    db: Session,
    *,
    clinic_id: int,
    amount: int,
    period_months: int,
    note: str | None,
    recorded_by: str | None,
    paid_until_after: datetime | None,
    idempotency_key: str | None = None,
) -> Payment:
    payment = Payment(
        clinic_id=clinic_id,
        amount=amount,
        period_months=period_months,
        note=note,
        recorded_by=recorded_by,
        paid_until_after=paid_until_after,
        idempotency_key=idempotency_key,
    )
    db.add(payment)
    db.flush()
    return payment


def get_by_idempotency_key(db: Session, clinic_id: int, idempotency_key: str) -> Payment | None:
    return db.scalar(
        select(Payment).where(Payment.clinic_id == clinic_id, Payment.idempotency_key == idempotency_key)
    )


def list_by_clinic(db: Session, clinic_id: int, *, limit: int = 100) -> list[Payment]:
    return list(
        db.scalars(
            select(Payment)
            .where(Payment.clinic_id == clinic_id)
            .order_by(Payment.paid_at.desc())
            .limit(limit)
        ).all()
    )
