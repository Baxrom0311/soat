"""DB access for the Device table.

get_by_device_id is intentionally global (not clinic-scoped): the /calls ingestion
endpoint only has a device_id + device key, not a clinic_id, so the clinic is derived
from the device row itself during authentication. Every other lookup is clinic-scoped.
"""

from datetime import datetime, timezone

from sqlalchemy import delete as delete_stmt, func, select, update
from sqlalchemy.orm import Session
from app.models import Call, Clinic, Device, DiscoveredDevice, UnassignedSignal


def list_by_clinic(db: Session, clinic_id: int) -> list[Device]:
    return list(
        db.scalars(select(Device).where(Device.clinic_id == clinic_id).order_by(Device.id)).all()
    )


def list_with_clinic(
    db: Session, clinic_id: int | None = None, *, limit: int = 200, offset: int = 0
) -> list[tuple[Device, Clinic]]:
    """Superadmin fleet view: every device (optionally one clinic's) with its clinic row."""
    stmt = (
        select(Device, Clinic)
        .join(Clinic, Device.clinic_id == Clinic.id)
        .order_by(Device.id)
        .limit(limit)
        .offset(offset)
    )
    if clinic_id is not None:
        stmt = stmt.where(Device.clinic_id == clinic_id)
    rows = db.execute(stmt).all()
    return [(device, clinic) for device, clinic in rows]


def count_all(db: Session) -> int:
    return db.scalar(select(func.count()).select_from(Device))


def count_online_since(db: Session, cutoff: datetime) -> int:
    return db.scalar(select(func.count()).select_from(Device).where(Device.last_seen_at >= cutoff))


def count_by_clinic(db: Session) -> dict[int, int]:
    """One grouped query for the superadmin clinics list (avoids a COUNT per clinic)."""
    rows = db.execute(select(Device.clinic_id, func.count()).group_by(Device.clinic_id)).all()
    return {clinic_id: count for clinic_id, count in rows}


def get(db: Session, clinic_id: int, device_id_pk: int) -> Device | None:
    return db.scalar(select(Device).where(Device.id == device_id_pk, Device.clinic_id == clinic_id))


def get_by_id(db: Session, device_id_pk: int) -> Device | None:
    """Unscoped lookup by primary key -- superadmin fleet view only, which already
    operates across every clinic by design."""
    return db.get(Device, device_id_pk)


def get_by_device_id(db: Session, device_id: str) -> Device | None:
    return db.scalar(select(Device).where(Device.device_id == device_id))


def get_by_chip_id(db: Session, chip_id: str) -> Device | None:
    return db.scalar(select(Device).where(Device.chip_id == chip_id))


def create(
    db: Session,
    clinic_id: int,
    *,
    device_id: str,
    device_api_key_hash: str,
    floor: int,
    chip_id: str | None = None,
    pending_key_plaintext: str | None = None,
) -> Device:
    device = Device(
        clinic_id=clinic_id,
        device_id=device_id,
        device_api_key_hash=device_api_key_hash,
        floor=floor,
        chip_id=chip_id,
        pending_key_plaintext=pending_key_plaintext,
    )
    db.add(device)
    db.flush()
    return device


def touch_last_seen(db: Session, device: Device) -> None:
    device.last_seen_at = datetime.now(timezone.utc)


def mark_key_delivered(db: Session, device: Device, *, now: datetime) -> None:
    """Records that the plaintext key was just handed to the ESP32 over /announce.
    Updated on every delivery (not just the first), so the 15-minute window is an idle
    timeout since the last successful check-in rather than a fixed one-shot deadline."""
    device.key_delivered_at = now


def clear_pending_key(db: Session, device: Device) -> None:
    """Scrubs the plaintext key once the delivery window has closed, so it doesn't
    linger in the DB indefinitely after it's no longer supposed to be retrievable."""
    device.pending_key_plaintext = None


def delete(db: Session, device: Device) -> None:
    db.execute(
        update(DiscoveredDevice)
        .where(DiscoveredDevice.claimed_device_id == device.id)
        .values(claimed_device_id=None)
    )
    db.execute(
        delete_stmt(UnassignedSignal).where(UnassignedSignal.device_id == device.id)
    )
    db.execute(
        delete_stmt(Call).where(Call.device_id == device.id)
    )
    db.delete(device)
