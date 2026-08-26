from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import DEVICE_ONLINE_WINDOW_SECONDS
from app.core.rate_limit import SlidingWindowLimiter
from app.core.security import generate_device_key, hash_secret, verify_secret
from app.models import Device
from app.repositories import device_repo
from app.schemas.device import DeviceOut

# Verified against when the device_id is unknown, so response timing can't be used to
# discover which device_ids exist. Same trick as auth_service._DUMMY_HASH.
_DUMMY_DEVICE_HASH = hash_secret("timing-equalizer-not-a-real-device-key")

# Guards the CPU cost of device-key auth itself. Verifying a key is a deliberately slow
# bcrypt (~230ms), and both callers are UNAUTHENTICATED, so without a check that runs
# BEFORE the hash a few dozen concurrent wrong-key requests saturate the CPU and exhaust
# the small DB pool -- and a real button press then queues behind them or times out.
# Keyed by source IP because there is no authenticated identity yet at this point.
#
# protect_limited=False: this limiter sits on the patient-call path, so a full key table
# (an unrelated attacker rotating addresses) must never turn into a refused press. See
# rate_limit's module docstring.
#
# Sized well above any real device: an ESP32 heartbeats every ~30s and posts a call per
# press, so a whole clinic's fleet behind one NAT address stays far under this.
DEVICE_AUTH_RATE_LIMIT_MAX = 120
DEVICE_AUTH_RATE_LIMIT_WINDOW_SECONDS = 60
_device_auth_limiter = SlidingWindowLimiter(
    max_events=DEVICE_AUTH_RATE_LIMIT_MAX,
    window_seconds=DEVICE_AUTH_RATE_LIMIT_WINDOW_SECONDS,
    protect_limited=False,
)


def check_device_auth_rate(client_ip: str) -> None:
    """Must be called BEFORE authenticate_device on every unauthenticated entry point.
    Raises 429, which the ESP32 firmware already treats as retryable (it queues and
    retries with backoff), so a genuine press is delayed rather than lost."""
    if not _device_auth_limiter.check(client_ip):
        raise HTTPException(
            status_code=429, detail="Too many device requests from this address, retry shortly"
        )


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
    Used only by the unauthenticated /calls ingestion and heartbeat endpoints.

    Timing-equalized the same way login is (auth_service._DUMMY_HASH): the verify runs
    against a real bcrypt hash even when the device_id is unknown. Short-circuiting
    made an unknown id answer in a few ms and a known one in ~230ms -- a 50x gap that
    is trivially measurable remotely, which turned device_id into an enumerable oracle
    and gave an attacker the one input they need to aim a bcrypt-CPU flood at the
    ingestion endpoint.
    """
    device = device_repo.get_by_device_id(db, device_id)
    stored_hash = device.device_api_key_hash if device is not None else _DUMMY_DEVICE_HASH
    # `or ""` keeps the verify running for a missing header too, so a malformed request
    # costs the same as a wrong key rather than returning early.
    key_ok = verify_secret(plaintext_key or "", stored_hash)
    if device is None or not plaintext_key or not key_ok:
        raise HTTPException(status_code=401, detail="Invalid device key")
    return device


def heartbeat(db: Session, *, device_id: str, plaintext_key: str | None, client_ip: str = "unknown") -> None:
    """Marks the device as alive. Deliberately not gated on subscription status:
    device connectivity is patient-safety infrastructure, not a billable feature."""
    check_device_auth_rate(client_ip)
    device = authenticate_device(db, device_id=device_id, plaintext_key=plaintext_key)
    device_repo.touch_last_seen(db, device)
    db.commit()
