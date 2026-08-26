from datetime import datetime

from pydantic import BaseModel

from app.enums import EffectiveStatus, SubscriptionStatus


class ClinicOut(BaseModel):
    id: int
    name: str
    # subscription_status is the raw DB column and is kept only for already-deployed
    # clients: it reads "active" for a clinic that is actually in grace or overdue.
    # New client code must use effective_status.
    subscription_status: SubscriptionStatus
    effective_status: EffectiveStatus
    created_at: datetime

    class Config:
        from_attributes = True


class ClinicBillingOut(BaseModel):
    """The clinic's own view of its subscription -- what the payment screen needs.

    Deliberately excludes enforcement_enabled and suspension_reason: those are vendor
    controls, not facts the clinic is entitled to (or able to act on). All money is
    whole so'm.
    """

    effective_status: EffectiveStatus
    paid_until: datetime | None
    days_until_expiry: int | None
    blocked_at: datetime | None
    is_blocked: bool
    is_in_grace: bool
    billing_period_months: int
    currency: str
    # list_price == before any promo discount; effective_price == what is actually owed.
    list_price: int | None
    effective_price: int | None
    device_count: int
    discount_percent: int | None
    discount_ends_at: datetime | None
    plan_name: str | None
    needs_warning: bool


class ClinicBillingNotice(BaseModel):
    """Warning-banner payload for the nurse-facing clients (phone + watch), which poll
    it. A nurse must be able to see that the subscription is expiring so they can tell
    management, but has no business seeing the clinic's prices -- so this carries no
    financial data at all, and is the only billing route open to non-admins."""

    warn: bool
    days_left: int | None
    blocked: bool
