from datetime import datetime

from pydantic import BaseModel


class ContactRequestIn(BaseModel):
    # No length constraints here on purpose: the service does the trimming and the
    # length checks so every rejection comes back as one consistent Uzbek 422 message
    # instead of Pydantic's English field-level errors.
    name: str
    phone: str
    clinic_name: str | None = None
    message: str | None = None


class ContactRequestOut(BaseModel):
    id: int
    name: str
    phone: str
    clinic_name: str | None
    message: str | None
    # Only ever serialized on the superadmin-only read route (abuse triage).
    source_ip: str | None
    handled: bool
    created_at: datetime

    class Config:
        from_attributes = True


class ContactRequestAck(BaseModel):
    ok: bool
