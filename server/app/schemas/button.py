from datetime import datetime

from pydantic import BaseModel


class ButtonCreate(BaseModel):
    ev1527_code: int
    room_id: int


class ButtonUpdate(BaseModel):
    room_id: int


class ButtonOut(BaseModel):
    id: int
    room_id: int
    room_number: str
    floor: int
    ev1527_code: int


class UnassignedSignalOut(BaseModel):
    id: int
    device_id: str
    ev1527_code: int
    first_seen_at: datetime
    last_seen_at: datetime
    seen_count: int
