from datetime import datetime

from pydantic import BaseModel, EmailStr


class StaffCreate(BaseModel):
    email: EmailStr
    password: str
    role: str
    name: str


class StaffOut(BaseModel):
    id: int
    email: str
    role: str
    name: str
    created_at: datetime

    class Config:
        from_attributes = True
