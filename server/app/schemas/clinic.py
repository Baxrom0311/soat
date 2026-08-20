from datetime import datetime

from pydantic import BaseModel


class ClinicOut(BaseModel):
    id: int
    name: str
    subscription_status: str
    created_at: datetime

    class Config:
        from_attributes = True
