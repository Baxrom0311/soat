"""DB access for the Staff table.

get_by_email is intentionally global (not clinic-scoped): email is unique across the
whole system and login happens before a clinic_id is known. Every other
lookup here is clinic-scoped.
"""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Staff


def get_by_email(db: Session, email: str) -> Staff | None:
    return db.scalar(select(Staff).where(Staff.email == email))


def count_by_clinic(db: Session) -> dict[int, int]:
    """One grouped query for the superadmin clinics list (avoids a COUNT per clinic)."""
    rows = db.execute(
        select(Staff.clinic_id, func.count())
        .where(Staff.clinic_id.is_not(None))
        .group_by(Staff.clinic_id)
    ).all()
    return {clinic_id: count for clinic_id, count in rows}


def list_by_clinic(db: Session, clinic_id: int) -> list[Staff]:
    return list(db.scalars(select(Staff).where(Staff.clinic_id == clinic_id).order_by(Staff.id)).all())


def create(db: Session, *, clinic_id: int, email: str, password_hash: str, role: str, name: str) -> Staff:
    staff = Staff(
        clinic_id=clinic_id,
        email=email,
        password_hash=password_hash,
        role=role,
        name=name,
    )
    db.add(staff)
    db.flush()
    return staff
