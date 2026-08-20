"""DB access for the Clinic table. No HTTP concerns, no business rules."""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Clinic


def create(db: Session, *, name: str, subscription_status: str = "trial") -> Clinic:
    clinic = Clinic(name=name, subscription_status=subscription_status)
    db.add(clinic)
    db.flush()  # caller needs clinic.id before creating dependent rows
    return clinic


def get(db: Session, clinic_id: int) -> Clinic | None:
    return db.get(Clinic, clinic_id)


def get_for_update(db: Session, clinic_id: int) -> Clinic | None:
    """Row-locked read (SELECT ... FOR UPDATE) so a read-modify-write (e.g. advancing
    paid_until on payment) can't lose an update under concurrent/double-submitted calls."""
    return db.scalar(select(Clinic).where(Clinic.id == clinic_id).with_for_update())


def list_all(db: Session) -> list[Clinic]:
    return list(db.scalars(select(Clinic).order_by(Clinic.id)).all())


def count_all(db: Session) -> int:
    return db.scalar(select(func.count()).select_from(Clinic))
