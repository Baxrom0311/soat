"""DB access for the PushToken table.

expo_push_token is globally unique (one physical device/app-install maps to one Expo
token), so upsert looks the token up by its own value first -- if it already exists
(same staff logging back in, or the same phone re-registering under a new session) it
just re-points clinic_id/staff_id instead of raising a unique-constraint violation.
"""

from sqlalchemy import delete as sa_delete, func, select
from sqlalchemy.orm import Session

from app.models import PushToken
from app.repositories import staff_floor_repo


def list_by_clinic(db: Session, clinic_id: int) -> list[PushToken]:
    return list(
        db.scalars(select(PushToken).where(PushToken.clinic_id == clinic_id).order_by(PushToken.id)).all()
    )


def list_by_clinic_for_floor(db: Session, clinic_id: int, floor: int) -> list[PushToken]:
    """Same as list_by_clinic but scoped to staff who should be notified about this
    floor -- admins, nurses with no floor assignments (unrestricted), and nurses
    assigned to this exact floor. See staff_floor_repo.visible_staff_ids_for_floor."""
    visible_staff_ids = staff_floor_repo.visible_staff_ids_for_floor(db, clinic_id, floor)
    return list(
        db.scalars(
            select(PushToken)
            .where(PushToken.clinic_id == clinic_id, PushToken.staff_id.in_(visible_staff_ids))
            .order_by(PushToken.id)
        ).all()
    )


def get_by_token(db: Session, token: str) -> PushToken | None:
    return db.scalar(select(PushToken).where(PushToken.expo_push_token == token))


def count_for_staff(db: Session, staff_id: int) -> int:
    return db.scalar(
        select(func.count()).select_from(PushToken).where(PushToken.staff_id == staff_id)
    )


def upsert(db: Session, *, clinic_id: int, staff_id: int, token: str) -> PushToken:
    existing = db.scalar(select(PushToken).where(PushToken.expo_push_token == token))
    if existing:
        existing.clinic_id = clinic_id
        existing.staff_id = staff_id
        db.flush()
        return existing
    row = PushToken(clinic_id=clinic_id, staff_id=staff_id, expo_push_token=token)
    db.add(row)
    db.flush()
    return row


def delete(db: Session, *, clinic_id: int, staff_id: int, token: str) -> None:
    db.execute(
        sa_delete(PushToken).where(
            PushToken.clinic_id == clinic_id,
            PushToken.staff_id == staff_id,
            PushToken.expo_push_token == token,
        )
    )


def delete_by_token(db: Session, token: str) -> None:
    """Used by the Expo push cleanup pass when Expo reports DeviceNotRegistered."""
    db.execute(sa_delete(PushToken).where(PushToken.expo_push_token == token))


def delete_all_for_staff(db: Session, staff_id: int) -> None:
    """Staff deletion must clear these first: staff_id has no ON DELETE CASCADE."""
    db.execute(sa_delete(PushToken).where(PushToken.staff_id == staff_id))
