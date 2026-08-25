from datetime import datetime

from pydantic import BaseModel, EmailStr

from app.enums import StaffRole


class StaffCreate(BaseModel):
    email: EmailStr
    password: str
    role: StaffRole
    name: str


class StaffUpdate(BaseModel):
    name: str | None = None
    email: EmailStr | None = None
    role: StaffRole | None = None
    password: str | None = None


class StaffOut(BaseModel):
    id: int
    email: str
    role: StaffRole
    name: str
    created_at: datetime

    class Config:
        from_attributes = True
