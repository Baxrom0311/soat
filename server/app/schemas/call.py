from datetime import datetime

from pydantic import BaseModel

from app.enums import CallStatus


class CallCreate(BaseModel):
    ev1527_code: int
    device_id: str
    # Optional client idempotency key (firmware retry queue re-sends with the same id)
    press_id: str | None = None


class CallCreateOut(BaseModel):
    call_id: int
    room_number: str
    floor: int
    created_at: datetime
    deduplicated: bool = False  # true when a repeat press was folded into an existing call


class ActiveCallOut(BaseModel):
    call_id: int
    room_number: str
    floor: int
    created_at: datetime
    status: CallStatus


class HistoryCallOut(BaseModel):
    call_id: int
    room_number: str
    floor: int
    status: CallStatus
    device_id: str
    created_at: datetime
    acknowledged_at: datetime | None
    acknowledged_by: str | None


class AckIn(BaseModel):
    acknowledged_by: str | None = None


class AckOut(BaseModel):
    call_id: int
    status: CallStatus
    acknowledged_at: datetime
