from pydantic import BaseModel, EmailStr

from app.enums import StaffRole


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class LoginOut(BaseModel):
    access_token: str
    role: StaffRole
    name: str
    clinic_id: int | None  # null for superadmin


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str
