from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import DEVICE_ONLINE_WINDOW_SECONDS
from app.core.security import generate_device_key, hash_secret, verify_secret
from app.models import Device
from app.repositories import device_repo
from app.schemas.device import DeviceOut


def online_cutoff() -> datetime:
    """Devices whose last_seen_at is at/after this instant count as online. The single
    definition of "online" — reused by the clinic list, admin fleet list and overview."""
    return datetime.now(timezone.utc) - timedelta(seconds=DEVICE_ONLINE_WINDOW_SECONDS)


def is_device_online(last_seen_at: datetime | None) -> bool:
    return last_seen_at is not None and last_seen_at >= online_cutoff()


def list_devices(db: Session, clinic_id: int) -> list[DeviceOut]:
    return [
        DeviceOut(
            id=device.id,
            device_id=device.device_id,
            floor=device.floor,
            last_seen_at=device.last_seen_at,
            online=is_device_online(device.last_seen_at),
            created_at=device.created_at,
        )
        for device in device_repo.list_by_clinic(db, clinic_id)
    ]


def update_device_floor(db: Session, clinic_id: int, device_pk: int, *, floor: int) -> DeviceOut:
    device = device_repo.get(db, clinic_id, device_pk)
    if device is None:
        raise HTTPException(status_code=404, detail="Device not found")
    device.floor = floor
    db.commit()
    db.refresh(device)
    return DeviceOut(
        id=device.id,
        device_id=device.device_id,
        floor=device.floor,
        last_seen_at=device.last_seen_at,
        online=is_device_online(device.last_seen_at),
        created_at=device.created_at,
    )


def register_device(
    db: Session, clinic_id: int, *, device_id: str, floor: int, chip_id: str | None = None
) -> tuple[Device, str]:
    """Returns (device, plaintext_key).

    Manual flow (chip_id=None): the plaintext key is generated here and only ever
    exists in memory/this response — only its hash is persisted.

    Zero-touch flow (chip_id set, from the superadmin claim endpoint): the plaintext
    key additionally gets persisted to pending_key_plaintext, since bcrypt's hash can't
    be turned back into it -- the ESP32 fetches it (once, within a security window)
    over /devices/announce instead of it ever being shown on a dashboard.
    """
    # No device cap: pricing is per receiver, so an extra device raises the bill rather
    # than being refused.
    plaintext_key = generate_device_key()
    try:
        # the repo flushes on create, so the duplicate-key error can surface here too
        device = device_repo.create(
            db,
            clinic_id,
            device_id=device_id,
            device_api_key_hash=hash_secret(plaintext_key),
            floor=floor,
            chip_id=chip_id,
            pending_key_plaintext=plaintext_key if chip_id else None,
        )
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="device_id already registered")
    db.refresh(device)
    return device, plaintext_key


def authenticate_device(db: Session, *, device_id: str, plaintext_key: str | None) -> Device:
    """Looks up a device by its (globally unique) device_id and verifies its API key.
    Used only by the unauthenticated /calls ingestion and heartbeat endpoints."""
    device = device_repo.get_by_device_id(db, device_id)
    if device is None or not plaintext_key or not verify_secret(plaintext_key, device.device_api_key_hash):
        raise HTTPException(status_code=401, detail="Invalid device key")
    return device


def heartbeat(db: Session, *, device_id: str, plaintext_key: str | None) -> None:
    """Marks the device as alive. Deliberately not gated on subscription status:
    device connectivity is patient-safety infrastructure, not a billable feature."""
    device = authenticate_device(db, device_id=device_id, plaintext_key=plaintext_key)
    device_repo.touch_last_seen(db, device)
    db.commit()
