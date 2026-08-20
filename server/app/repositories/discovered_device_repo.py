"""DB access for the DiscoveredDevice table (zero-touch ESP32 discovery ledger)."""

from datetime import datetime

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models import DiscoveredDevice


def get_by_chip_id(db: Session, chip_id: str) -> DiscoveredDevice | None:
    return db.scalar(select(DiscoveredDevice).where(DiscoveredDevice.chip_id == chip_id))


def upsert_seen(db: Session, *, chip_id: str, last_ip: str | None, now: datetime) -> DiscoveredDevice:
    """Insert a new sighting, or bump last_seen_at/last_ip if this chip has been seen
    before (whether or not it has since been claimed)."""
    existing = get_by_chip_id(db, chip_id)
    if existing is not None:
        existing.last_seen_at = now
        existing.last_ip = last_ip
        return existing
    row = DiscoveredDevice(
        chip_id=chip_id, first_seen_at=now, last_seen_at=now, last_ip=last_ip
    )
    db.add(row)
    db.flush()
    return row


def list_unclaimed_online(db: Session, cutoff: datetime) -> list[DiscoveredDevice]:
    """Superadmin's "online, unclaimed" list."""
    return list(
        db.scalars(
            select(DiscoveredDevice)
            .where(
                DiscoveredDevice.claimed_device_id.is_(None),
                DiscoveredDevice.last_seen_at >= cutoff,
            )
            .order_by(DiscoveredDevice.last_seen_at.desc())
        ).all()
    )


def mark_claimed(db: Session, *, chip_id: str, device_pk: int) -> None:
    row = get_by_chip_id(db, chip_id)
    if row is not None:
        row.claimed_device_id = device_pk


def delete_stale_unclaimed(db: Session, cutoff: datetime) -> None:
    """Best-effort housekeeping: drop unclaimed sightings nobody has looked at in a
    while. Never touches claimed rows (kept for history)."""
    db.execute(
        delete(DiscoveredDevice).where(
            DiscoveredDevice.claimed_device_id.is_(None),
            DiscoveredDevice.last_seen_at < cutoff,
        )
    )
