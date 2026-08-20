"""DB access for the UnassignedSignal table."""

from datetime import datetime, timezone

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models import Device, UnassignedSignal


def list_with_device_by_clinic(db: Session, clinic_id: int) -> list[tuple[UnassignedSignal, Device]]:
    rows = db.execute(
        select(UnassignedSignal, Device)
        .join(Device, UnassignedSignal.device_id == Device.id)
        .where(UnassignedSignal.clinic_id == clinic_id)
        .order_by(UnassignedSignal.last_seen_at.desc())
    ).all()
    return [(sig, device) for sig, device in rows]


def get_by_code(db: Session, clinic_id: int, ev1527_code: int) -> UnassignedSignal | None:
    return db.scalar(
        select(UnassignedSignal).where(
            UnassignedSignal.clinic_id == clinic_id, UnassignedSignal.ev1527_code == ev1527_code
        )
    )


def record_sighting(db: Session, clinic_id: int, *, device_pk: int, ev1527_code: int) -> UnassignedSignal:
    """Insert a new unassigned-signal row, or bump last_seen_at/seen_count if one already
    exists. Returns the row so the caller can broadcast it to dashboards after commit."""
    existing = get_by_code(db, clinic_id, ev1527_code)
    now = datetime.now(timezone.utc)
    if existing:
        existing.last_seen_at = now
        existing.seen_count += 1
        existing.device_id = device_pk
        return existing
    signal = UnassignedSignal(
        clinic_id=clinic_id,
        device_id=device_pk,
        ev1527_code=ev1527_code,
        first_seen_at=now,
        last_seen_at=now,
        seen_count=1,
    )
    db.add(signal)
    db.flush()  # caller needs signal.id for the broadcast
    return signal


def delete_by_code(db: Session, clinic_id: int, ev1527_code: int) -> None:
    db.execute(
        delete(UnassignedSignal).where(
            UnassignedSignal.clinic_id == clinic_id, UnassignedSignal.ev1527_code == ev1527_code
        )
    )
