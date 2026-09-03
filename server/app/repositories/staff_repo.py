"""DB access for the Staff table.

get_by_email is intentionally global (not clinic-scoped): email is unique across the
whole system and login happens before a clinic_id is known. Every other
lookup here is clinic-scoped.
"""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.enums import StaffRole
from app.models import Staff


def get_by_email(db: Session, email: str) -> Staff | None:
    clean_email = email.strip().lower()
    return db.scalar(select(Staff).where(func.lower(Staff.email) == clean_email))


def get_by_id(db: Session, staff_id: int) -> Staff | None:
    """Unscoped lookup by primary key -- only for self-service actions (change own
    password) where the caller's own JWT staff_id is trusted; everything clinic-facing
    must go through get() below instead."""
    return db.get(Staff, staff_id)


def get(db: Session, clinic_id: int, staff_id: int) -> Staff | None:
    return db.scalar(select(Staff).where(Staff.id == staff_id, Staff.clinic_id == clinic_id))


def count_admins(db: Session, clinic_id: int) -> int:
    return db.scalar(
        select(func.count()).select_from(Staff).where(Staff.clinic_id == clinic_id, Staff.role == StaffRole.ADMIN)
    )


def delete(db: Session, staff: Staff) -> None:
    db.delete(staff)


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


def create(db: Session, *, clinic_id: int, email: str, password_hash: str, role: StaffRole, name: str) -> Staff:
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
