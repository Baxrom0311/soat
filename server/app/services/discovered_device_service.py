"""Zero-touch ESP32 discovery & claim.

An ESP32 that doesn't have a device key yet (fresh off the flash, using nothing but
its own hardware chip id) pings the unauthenticated POST /api/v1/devices/announce
endpoint. The superadmin sees it show up "online, unclaimed" and claims it to a
clinic+floor. From that point on, the *same* announce call starts handing the
device's real key back to it (once, inside a short security window) so the firmware
can save it to NVS and switch to normal authenticated operation -- no manual
device_id/key entry, no re-flashing.
"""

import secrets
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.config import (
    ANNOUNCE_RATE_LIMIT_MAX,
    ANNOUNCE_RATE_LIMIT_WINDOW_SECONDS,
    DISCOVERED_DEVICE_ONLINE_WINDOW_SECONDS,
    KEY_DELIVERY_WINDOW_MINUTES,
)
from app.core.rate_limit import SlidingWindowLimiter
from app.repositories import clinic_repo, device_repo, discovered_device_repo
from app.schemas.device import AnnounceOut, ClaimDeviceOut, DiscoveredDeviceOut
from app.services import device_service

# /announce is unauthenticated (the ESP32 has no key yet), so IP throttling is the
# only thing standing between it and being hammered.
_announce_limiter = SlidingWindowLimiter(
    max_events=ANNOUNCE_RATE_LIMIT_MAX, window_seconds=ANNOUNCE_RATE_LIMIT_WINDOW_SECONDS
)


def _check_announce_rate(client_ip: str) -> None:
    if not _announce_limiter.check(client_ip):
        raise HTTPException(status_code=429, detail="Too many announce requests, try again later")


def announce(db: Session, *, chip_id: str, client_ip: str) -> AnnounceOut:
    _check_announce_rate(client_ip)

    now = datetime.now(timezone.utc)
    discovered_device_repo.upsert_seen(db, chip_id=chip_id, last_ip=client_ip, now=now)
    # Best-effort housekeeping, piggybacked on a request that's already writing --
    # small-scale deployment, so a dedicated cleanup job isn't worth it yet.
    discovered_device_repo.delete_stale_unclaimed(db, cutoff=now - timedelta(hours=24))
    db.commit()

    device = device_repo.get_by_chip_id(db, chip_id)
    if device is None:
        return AnnounceOut(claimed=False)

    # Bounded from claim time (created_at), NOT from key_delivered_at: the latter used
    # to be updated on every successful delivery, which turned this into an idle
    # timeout an attacker could keep alive forever by polling every <15 minutes. A
    # fixed deadline from the actual claim still tolerates the ESP32 retrying after a
    # lost response, but the window genuinely closes 15 minutes after the device was
    # claimed, no matter how many times /announce is called in the meantime.
    window_open = now - device.created_at <= timedelta(minutes=KEY_DELIVERY_WINDOW_MINUTES)
    if not window_open:
        # Window closed: the ESP32 should already have picked up its key on an earlier
        # call. Scrub the plaintext so it doesn't linger in the DB any longer than it
        # has to.
        if device.pending_key_plaintext is not None:
            device_repo.clear_pending_key(db, device)
            db.commit()
        return AnnounceOut(claimed=True, device_id=device.device_id, device_key=None)

    device_repo.mark_key_delivered(db, device, now=now)
    db.commit()
    return AnnounceOut(claimed=True, device_id=device.device_id, device_key=device.pending_key_plaintext)


def list_discovered(db: Session) -> list[DiscoveredDeviceOut]:
    cutoff = datetime.now(timezone.utc) - timedelta(seconds=DISCOVERED_DEVICE_ONLINE_WINDOW_SECONDS)
    return [
        DiscoveredDeviceOut(
            chip_id=row.chip_id, first_seen_at=row.first_seen_at, last_seen_at=row.last_seen_at
        )
        for row in discovered_device_repo.list_unclaimed_online(db, cutoff)
    ]


def claim(
    db: Session, *, chip_id: str, clinic_id: int, floor: int, device_id: str | None
) -> ClaimDeviceOut:
    discovered = discovered_device_repo.get_by_chip_id(db, chip_id)
    if discovered is None:
        raise HTTPException(status_code=404, detail="Discovered device not found")
    if discovered.claimed_device_id is not None:
        raise HTTPException(status_code=409, detail="Device already claimed")
    if device_repo.get_by_chip_id(db, chip_id) is not None:
        raise HTTPException(status_code=409, detail="Chip already bound to a device")
    if clinic_repo.get(db, clinic_id) is None:
        raise HTTPException(status_code=404, detail="Clinic not found")

    # The auto-generated suffix must NOT embed any part of chip_id: chip_id is the
    # secret needed to steal a device's key via /announce (see the security window
    # above), and device_id is visible to every clinic staff member via GET /devices.
    final_device_id = device_id or f"floor{floor}-esp32-{secrets.token_hex(4)}"
    # device_service handles key generation/hashing and the duplicate device_id 409;
    # chip_id set here is what makes the next /announce call hand the key back.
    device, _plaintext_key = device_service.register_device(
        db, clinic_id, device_id=final_device_id, floor=floor, chip_id=chip_id
    )
    discovered_device_repo.mark_claimed(db, chip_id=chip_id, device_pk=device.id)
    db.commit()
    return ClaimDeviceOut(device_id=device.device_id, clinic_id=clinic_id)
