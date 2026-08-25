from datetime import datetime

from pydantic import BaseModel

from app.enums import SubscriptionStatus


class ClinicOut(BaseModel):
    id: int
    name: str
    subscription_status: SubscriptionStatus
    created_at: datetime

    class Config:
        from_attributes = True
