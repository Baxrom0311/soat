from fastapi import APIRouter, Depends, Header, Request
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser, get_clinic_user, get_db, require_admin
from app.schemas.device import (
    AnnounceIn,
    AnnounceOut,
    DeviceCreate,
    DeviceCreateOut,
    DeviceOut,
    HeartbeatIn,
    HeartbeatOut,
)
from app.services import device_service, discovered_device_service

router = APIRouter(prefix="/api/v1/devices", tags=["devices"])


@router.get("", response_model=list[DeviceOut])
def list_devices(user: CurrentUser = Depends(get_clinic_user), db: Session = Depends(get_db)):
    return device_service.list_devices(db, user.clinic_id)


@router.post("", response_model=DeviceCreateOut, status_code=201)
def create_device(
    body: DeviceCreate,
    user: CurrentUser = Depends(require_admin),  # mints a device credential — admin only
    db: Session = Depends(get_db),
):
    # plaintext_key is only ever returned here — it is not recoverable afterwards
    device, plaintext_key = device_service.register_device(
        db, user.clinic_id, device_id=body.device_id, floor=body.floor
    )
    return DeviceCreateOut(device_id=device.device_id, device_api_key=plaintext_key)


@router.post("/heartbeat", response_model=HeartbeatOut)
def heartbeat(
    body: HeartbeatIn,
    x_device_key: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    # Device-key auth, never subscription-gated: heartbeats are patient-safety plumbing.
    device_service.heartbeat(db, device_id=body.device_id, plaintext_key=x_device_key)
    return HeartbeatOut(ok=True)


@router.post("/announce", response_model=AnnounceOut)
def announce(body: AnnounceIn, request: Request, db: Session = Depends(get_db)):
    # Deliberately UNAUTHENTICATED: a fresh-off-the-flash ESP32 has no device key yet,
    # only its own hardware chip id. Rate-limited per IP inside the service instead.
    client_ip = request.client.host if request.client else "unknown"
    return discovered_device_service.announce(db, chip_id=body.chip_id, client_ip=client_ip)
