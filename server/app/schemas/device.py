import re
from datetime import datetime

from pydantic import BaseModel, field_validator

# Hex chip id as read off the ESP32 itself (e.g. efuse MAC) -- 6 to 32 hex chars covers
# everything from a 3-byte short id up to a 16-byte unique id with room to spare.
_CHIP_ID_RE = re.compile(r"^[0-9a-fA-F]{6,32}$")


class DeviceCreate(BaseModel):
    device_id: str
    floor: int


class DeviceOut(BaseModel):
    id: int
    device_id: str
    floor: int
    last_seen_at: datetime | None
    online: bool
    created_at: datetime


class DeviceCreateOut(BaseModel):
    device_id: str
    device_api_key: str


class HeartbeatIn(BaseModel):
    device_id: str


class HeartbeatOut(BaseModel):
    ok: bool


class AnnounceIn(BaseModel):
    chip_id: str

    @field_validator("chip_id")
    @classmethod
    def _normalize_chip_id(cls, value: str) -> str:
        value = value.strip().lower()
        if not _CHIP_ID_RE.match(value):
            raise ValueError("chip_id must be a 6-32 character hex string")
        return value


class AnnounceOut(BaseModel):
    claimed: bool
    device_id: str | None = None
    device_key: str | None = None


class DiscoveredDeviceOut(BaseModel):
    chip_id: str
    first_seen_at: datetime
    last_seen_at: datetime


class ClaimDeviceIn(BaseModel):
    clinic_id: int
    floor: int
    device_id: str | None = None


class ClaimDeviceOut(BaseModel):
    device_id: str
    clinic_id: int
