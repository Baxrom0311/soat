from datetime import datetime

from pydantic import BaseModel, EmailStr

from app.enums import StaffRole


class StaffCreate(BaseModel):
    email: EmailStr
    password: str
    role: StaffRole
    name: str
    # Empty == unrestricted (sees/gets notified of every floor) -- the safe default
    # until an admin assigns this nurse to specific floor(s).
    floors: list[int] = []


class StaffUpdate(BaseModel):
    name: str | None = None
    email: EmailStr | None = None
    role: StaffRole | None = None
    password: str | None = None
    # None == don't change; [] == clear (back to unrestricted); [1, 2] == set exactly these.
    floors: list[int] | None = None


class StaffOut(BaseModel):
    id: int
    email: str
    role: StaffRole
    name: str
    created_at: datetime
    floors: list[int]

    class Config:
        from_attributes = True
