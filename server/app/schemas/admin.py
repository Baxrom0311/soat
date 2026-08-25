from datetime import datetime

from pydantic import BaseModel, EmailStr, Field

from app.enums import EffectiveStatus, StaffRole, SubscriptionStatus


class AdminOverviewOut(BaseModel):
    clinics: int
    devices_total: int
    devices_online: int
    active_calls_total: int


# ---- Plans (tariff rejalari) ----
class PlanCreate(BaseModel):
    name: str
    price_amount: int = Field(ge=0)
    currency: str = "UZS"
    billing_period_months: int = Field(default=1, ge=1, le=60)
    max_devices: int | None = Field(default=None, ge=1)


class PlanUpdate(BaseModel):
    name: str | None = None
    price_amount: int | None = Field(default=None, ge=0)
    currency: str | None = None
    billing_period_months: int | None = Field(default=None, ge=1, le=60)
    max_devices: int | None = Field(default=None, ge=1)
    is_active: bool | None = None


class PlanOut(BaseModel):
    id: int
    name: str
    price_amount: int
    currency: str
    billing_period_months: int
    max_devices: int | None
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


# ---- Payments (to'lovlar) ----
class PaymentCreate(BaseModel):
    amount: int = Field(ge=0)
    period_months: int = Field(default=1, ge=1, le=60)
    note: str | None = None


class PaymentOut(BaseModel):
    id: int
    clinic_id: int
    amount: int
    period_months: int
    note: str | None
    recorded_by: str | None
    paid_until_after: datetime | None
    paid_at: datetime

    class Config:
        from_attributes = True


class AdminClinicCreate(BaseModel):
    name: str


class AdminClinicUpdate(BaseModel):
    name: str | None = None
    subscription_status: SubscriptionStatus | None = None
    # Billing edits (all optional). To assign a plan, send plan_id; to remove it, send
    # clear_plan=true (NOT plan_id=0). Likewise clear_custom_price=true removes the
    # per-clinic override so the plan price applies again.
    plan_id: int | None = None
    clear_plan: bool = False
    custom_price_amount: int | None = Field(default=None, ge=0)
    clear_custom_price: bool = False


class AdminClinicOut(BaseModel):
    id: int
    name: str
    subscription_status: SubscriptionStatus
    created_at: datetime

    class Config:
        from_attributes = True


# Billing view attached to every clinic row the superadmin sees.
class ClinicBilling(BaseModel):
    plan_id: int | None
    plan_name: str | None
    effective_price: int | None
    custom_price_amount: int | None
    currency: str
    paid_until: datetime | None
    effective_status: EffectiveStatus  # trial | active | suspended | overdue
    max_devices: int | None


class AdminClinicListItem(AdminClinicOut):
    staff_count: int
    device_count: int
    room_count: int
    active_calls: int
    billing: ClinicBilling


class AdminClinicAdminCreate(BaseModel):
    email: EmailStr
    password: str
    name: str


class AdminClinicAdminOut(BaseModel):
    id: int
    email: str
    name: str
    role: StaffRole


class AdminClinicStaffOut(BaseModel):
    id: int
    email: str
    name: str
    role: StaffRole
    created_at: datetime

    class Config:
        from_attributes = True


class AdminPasswordResetOut(BaseModel):
    new_password: str


class AdminDeviceCreate(BaseModel):
    clinic_id: int
    device_id: str
    floor: int


class AdminDeviceUpdate(BaseModel):
    floor: int


class AdminDeviceOut(BaseModel):
    id: int
    clinic_id: int
    clinic_name: str
    device_id: str
    floor: int
    created_at: datetime
    last_seen_at: datetime | None
    online: bool


class AuditLogOut(BaseModel):
    id: int
    actor_name: str
    actor_email: str
    actor_role: str
    action: str
    target_type: str
    target_id: int | None
    before: dict | None
    after: dict | None
    ip_address: str | None
    created_at: datetime

    class Config:
        from_attributes = True
