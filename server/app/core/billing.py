"""Pure subscription/billing rules — no DB, no HTTP. Shared by the request gate
(core.deps) and the superadmin service so "is this clinic blocked?" has exactly one
definition. Everything takes a Clinic model instance and an explicit `now`.

Access rules:
  - A clinic is BLOCKED (staff get 402) when it is manually suspended, OR its
    paid_until has passed AND the BILLING_GRACE_PERIOD_DAYS grace window since then
    has also elapsed. Manual suspension always wins and is never softened by grace.
  - A clinic that is overdue but still inside the grace window is NOT blocked yet --
    staff keep working, but the superadmin dashboard shows "grace" instead of "active"
    so the lapse is visible and can be followed up before it turns into a real outage.
  - "trial" clinics are never payment-gated (paid_until is ignored) so a brand-new
    clinic works before any billing is configured.
  - Device ingestion / heartbeat never go through this gate (they use device-key auth),
    so patient calls keep flowing even for a blocked clinic. That guarantee lives at the
    routing layer, not here.
"""

from datetime import datetime, timedelta, timezone

from app.core.config import BILLING_GRACE_PERIOD_DAYS
from app.enums import EffectiveStatus, SubscriptionStatus


def _now(now: datetime | None) -> datetime:
    return now if now is not None else datetime.now(timezone.utc)


def is_overdue(clinic, now: datetime | None = None) -> bool:
    if clinic.subscription_status == SubscriptionStatus.TRIAL:
        return False
    if clinic.paid_until is None:
        return False
    return clinic.paid_until < _now(now)


def is_in_grace(clinic, now: datetime | None = None) -> bool:
    """Overdue, but still within BILLING_GRACE_PERIOD_DAYS of paid_until -- staff
    keep working, but the clinic should be shown/followed up as unpaid."""
    if not is_overdue(clinic, now):
        return False
    return _now(now) <= clinic.paid_until + timedelta(days=BILLING_GRACE_PERIOD_DAYS)


def is_blocked(clinic, now: datetime | None = None) -> bool:
    """True == staff requests must be rejected with 402."""
    if clinic.subscription_status == SubscriptionStatus.SUSPENDED:
        return True
    if not is_overdue(clinic, now):
        return False
    return not is_in_grace(clinic, now)


def effective_status(clinic, now: datetime | None = None) -> EffectiveStatus:
    """What the superadmin UI shows: manual 'suspended' | 'overdue' (auto, grace period
    elapsed) | 'grace' (auto, overdue but still within the grace window) | the raw
    'trial'/'active' status when the clinic is in good standing."""
    if clinic.subscription_status == SubscriptionStatus.SUSPENDED:
        return EffectiveStatus.SUSPENDED
    if is_overdue(clinic, now):
        return EffectiveStatus.GRACE if is_in_grace(clinic, now) else EffectiveStatus.OVERDUE
    return EffectiveStatus(clinic.subscription_status.value)


def effective_price(clinic, plan_price: int | None) -> int | None:
    """Per-clinic override wins over the plan's price; None when neither is set."""
    if clinic.custom_price_amount is not None:
        return clinic.custom_price_amount
    return plan_price


def add_months(dt: datetime, months: int) -> datetime:
    """Add whole months without dateutil, clamping the day to the target month's length
    (e.g. Jan 31 + 1 month -> Feb 28/29)."""
    month_index = dt.month - 1 + months
    year = dt.year + month_index // 12
    month = month_index % 12 + 1
    # last day of the target month
    if month == 12:
        next_month_first = dt.replace(year=year + 1, month=1, day=1)
    else:
        next_month_first = dt.replace(year=year, month=month + 1, day=1)

    last_day = (next_month_first - timedelta(days=1)).day
    return dt.replace(year=year, month=month, day=min(dt.day, last_day))
