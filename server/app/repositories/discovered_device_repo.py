"""DB access for the DiscoveredDevice table (zero-touch ESP32 discovery ledger)."""

from datetime import datetime

from sqlalchemy import and_, delete, or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.models import DiscoveredDevice


def get_by_chip_id(db: Session, chip_id: str) -> DiscoveredDevice | None:
    return db.scalar(select(DiscoveredDevice).where(DiscoveredDevice.chip_id == chip_id))


def upsert_seen(
    db: Session, *, chip_id: str, last_ip: str | None, now: datetime, secret_hash: str
) -> DiscoveredDevice | None:
    """Insert a new sighting, or bump last_seen_at/last_ip if this chip has been seen
    before (whether or not it has since been claimed).

    A single atomic INSERT .. ON CONFLICT DO UPDATE. The previous read-then-write version
    raised StaleDataError ("expected to update 1 row(s); 0 were matched") whenever a
    concurrent /announce ran delete_stale_unclaimed and removed the very row this session
    had loaded and marked dirty -- which is routine, because several ESP32s announce every
    5 seconds and the housekeeping delete runs on every one of those requests. The device
    then got a 500 and never appeared in the superadmin's discovery list, so a brand-new
    receiver could silently fail to be adoptable.

    first_seen_at is not in the update set: it is the moment the chip was first heard from.
    """
    stmt = (
        pg_insert(DiscoveredDevice)
        .values(
            chip_id=chip_id,
            first_seen_at=now,
            last_seen_at=now,
            last_ip=last_ip,
            provisioning_secret_hash=secret_hash,
        )
        .on_conflict_do_update(
            index_elements=[DiscoveredDevice.chip_id],
            set_={"last_seen_at": now, "last_ip": last_ip, "provisioning_secret_hash": secret_hash},
            where=or_(
                DiscoveredDevice.provisioning_secret_hash == secret_hash,
                and_(
                    DiscoveredDevice.provisioning_secret_hash.is_(None),
                    DiscoveredDevice.claimed_device_id.is_(None),
                ),
            ),
        )
        .returning(DiscoveredDevice)
    )
    return db.execute(stmt).scalar_one_or_none()


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
