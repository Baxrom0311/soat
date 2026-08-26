from datetime import datetime

from pydantic import BaseModel, EmailStr, Field

from app.enums import EffectiveStatus, StaffRole, SubscriptionStatus, SuspensionReason


class AdminOverviewOut(BaseModel):
    clinics: int
    devices_total: int
    devices_online: int
    active_calls_total: int


# ---- Plans (tariff rejalari) ----
class PlanCreate(BaseModel):
    name: str
    currency: str = "UZS"
    # Per ESP32 receiver, with a per-period floor. Monthly and annual rates are
    # independent -- the annual discount is a commercial decision, not a fixed ratio.
    price_per_device_monthly: int = Field(ge=0)
    price_per_device_annual: int = Field(ge=0)
    min_price_monthly: int = Field(default=0, ge=0)
    min_price_annual: int = Field(default=0, ge=0)


class PlanUpdate(BaseModel):
    name: str | None = None
    currency: str | None = None
    price_per_device_monthly: int | None = Field(default=None, ge=0)
    price_per_device_annual: int | None = Field(default=None, ge=0)
    min_price_monthly: int | None = Field(default=None, ge=0)
    min_price_annual: int | None = Field(default=None, ge=0)
    is_active: bool | None = None


class PlanOut(BaseModel):
    id: int
    name: str
    currency: str
    price_per_device_monthly: int
    price_per_device_annual: int
    min_price_monthly: int
    min_price_annual: int
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


# ---- Payments (to'lovlar) ----
class PaymentCreate(BaseModel):
    amount: int = Field(ge=0)
    # NULL == use the clinic's configured billing_period_months. An explicit value is an
    # exception (a negotiated one-off period), not the normal path.
    period_months: int | None = Field(default=None, ge=1, le=60)
    # `amount` is checked against what the clinic actually owes so a mistyped figure
    # can't be stored silently. A part payment or a negotiated one-off is still
    # recordable -- but only by ticking this on purpose.
    allow_amount_mismatch: bool = False
    note: str | None = None
    # Client-generated (e.g. a UUID minted once per form-open): a retried/duplicated
    # POST with the same key returns the original payment instead of recording and
    # applying a second one. Optional -- omitting it just means no dedup protection.
    idempotency_key: str | None = None


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
    # 1 == monthly, 12 == annual; picks which of the plan's two rates applies.
    billing_period_months: int | None = None
    # Promotional discount: percent + duration. discount_started_at is stamped
    # server-side when the discount is first applied. clear_discount=true removes all
    # three at once (a discount is one deal, not three independent fields).
    discount_percent: int | None = None
    discount_months: int | None = None
    clear_discount: bool = False
    enforcement_enabled: bool | None = None


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
    # list_price == before any promo discount; effective_price == what is actually owed.
    list_price: int | None
    effective_price: int | None
    custom_price_amount: int | None
    currency: str
    billing_period_months: int
    device_count: int
    paid_until: datetime | None
    effective_status: EffectiveStatus  # trial | active | suspended | grace | overdue
    days_until_expiry: int | None
    blocked_at: datetime | None
    enforcement_enabled: bool
    suspension_reason: SuspensionReason | None
    discount_percent: int | None
    discount_months: int | None
    discount_ends_at: datetime | None


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
