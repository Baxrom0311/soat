from datetime import datetime

from pydantic import BaseModel, EmailStr


class StaffCreate(BaseModel):
    email: EmailStr
    password: str
    role: str
    name: str


class StaffUpdate(BaseModel):
    name: str | None = None
    email: EmailStr | None = None
    role: str | None = None
    password: str | None = None


class StaffOut(BaseModel):
    id: int
    email: str
    role: str
    name: str
    created_at: datetime

    class Config:
        from_attributes = True
