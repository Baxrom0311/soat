from pydantic import BaseModel


class RoomCreate(BaseModel):
    room_number: str
    floor: int


class RoomUpdate(BaseModel):
    room_number: str | None = None
    floor: int | None = None


class RoomOut(BaseModel):
    id: int
    room_number: str
    floor: int

    class Config:
        from_attributes = True
