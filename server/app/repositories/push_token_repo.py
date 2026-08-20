"""DB access for the PushToken table.

expo_push_token is globally unique (one physical device/app-install maps to one Expo
token), so upsert looks the token up by its own value first -- if it already exists
(same staff logging back in, or the same phone re-registering under a new session) it
just re-points clinic_id/staff_id instead of raising a unique-constraint violation.
"""

from sqlalchemy import delete as sa_delete, select
from sqlalchemy.orm import Session

from app.models import PushToken


def list_by_clinic(db: Session, clinic_id: int) -> list[PushToken]:
    return list(
        db.scalars(select(PushToken).where(PushToken.clinic_id == clinic_id).order_by(PushToken.id)).all()
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
