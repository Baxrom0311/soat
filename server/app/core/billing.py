"""Pure subscription/billing rules — no DB, no HTTP. Shared by the request gates
(core.deps), the superadmin service, the clinic-facing billing view and the expiry
warning job, so "is this clinic blocked?" and "what does it cost?" each have exactly
one definition. Everything takes model instances and an explicit `now`.

Access rules:
  - A clinic is BLOCKED when it is manually suspended, OR (enforcement is enabled AND
    paid_until has passed AND the BILLING_GRACE_PERIOD_DAYS window since then has also
    elapsed). Manual suspension always wins: it ignores both grace and the enforcement
    flag, because it is an explicit human decision rather than an automatic lapse.
  - Overdue but inside grace is NOT blocked -- staff keep working while the lapse is
    surfaced as "grace" so it can be chased before it becomes an outage.
  - "trial" clinics are never payment-gated (paid_until is ignored) so a brand-new
    clinic works before any billing is configured. Trial is ended deliberately by a
    superadmin, never by a timer.
  - BLOCKED only ever gates CLINIC MANAGEMENT (see core.deps). Patient call ingestion,
    push notification, the nurse's active-call list and acknowledgment all keep working
    for a blocked clinic -- an unpaid invoice must never be able to turn into a patient
    pressing a button and nobody coming. That guarantee lives at the routing layer.

Pricing:
  - Per ESP32 receiver, linear, with a per-period floor (see models.Plan).
  - custom_price_amount, when set, replaces the computed figure entirely.
  - A time-limited percentage discount then applies on top of whichever of those two
    is in play.
"""

from datetime import datetime, timedelta, timezone

from app.core.config import BILLING_GRACE_PERIOD_DAYS, BILLING_WARN_BEFORE_DAYS
from app.enums import EffectiveStatus, SubscriptionStatus, SuspensionReason

ANNUAL_PERIOD_MONTHS = 12


def _now(now: datetime | None) -> datetime:
    return now if now is not None else datetime.now(timezone.utc)


# --------------------------------------------------------------------------- status


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
    """True == clinic MANAGEMENT requests must be rejected with 402. Alerting paths are
    never gated by this -- see the module docstring."""
    if clinic.subscription_status == SubscriptionStatus.SUSPENDED:
        return True
    # Checked after manual suspension on purpose: the flag switches off the automatic
    # payment-lapse path only, it is not a way to un-suspend a clinic.
    if not clinic.enforcement_enabled:
        return False
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


def is_payment_lapse_suspension(clinic) -> bool:
    """Whether recording a payment should lift this clinic's suspension. A manual
    suspension must not be clearable by wiring money."""
    return (
        clinic.subscription_status == SubscriptionStatus.SUSPENDED
        and clinic.suspension_reason == SuspensionReason.PAYMENT_LAPSE
    )


# ------------------------------------------------------------------------- warnings


def days_until_expiry(clinic, now: datetime | None = None) -> int | None:
    """Whole days remaining before paid_until, negative once it has passed. None when
    the clinic has no paid-through date or is on trial (nothing to expire)."""
    if clinic.paid_until is None or clinic.subscription_status == SubscriptionStatus.TRIAL:
        return None
    delta = clinic.paid_until - _now(now)
    # Round toward zero on the positive side so "0 days left" means "expires today"
    # rather than appearing while there is still most of a day in hand.
    return delta.days


def blocked_at(clinic) -> datetime | None:
    """The instant management access actually cuts off: end of the grace window."""
    if clinic.paid_until is None:
        return None
    return clinic.paid_until + timedelta(days=BILLING_GRACE_PERIOD_DAYS)


def needs_expiry_warning(clinic, now: datetime | None = None) -> bool:
    """True from BILLING_WARN_BEFORE_DAYS ahead of paid_until until the clinic is
    actually blocked -- i.e. across the run-up AND the grace window, which is the whole
    span where a phone call can still prevent an outage."""
    if clinic.subscription_status == SubscriptionStatus.TRIAL:
        return False
    if not clinic.enforcement_enabled:
        return False
    remaining = days_until_expiry(clinic, now)
    if remaining is None:
        return False
    if remaining > BILLING_WARN_BEFORE_DAYS:
        return False
    return not is_blocked(clinic, now)


# -------------------------------------------------------------------------- pricing


def _plan_rates(plan, billing_period_months: int) -> tuple[int, int]:
    """(per-device price, minimum price) for the period this clinic is billed on."""
    if billing_period_months >= ANNUAL_PERIOD_MONTHS:
        return plan.price_per_device_annual, plan.min_price_annual
    return plan.price_per_device_monthly, plan.min_price_monthly


def list_price(clinic, plan, device_count: int) -> int | None:
    """Price before any promotional discount: the negotiated per-clinic figure if one is
    set, otherwise per-device x devices, floored at the plan's minimum. None when the
    clinic has neither an override nor a plan (billing not configured yet)."""
    if clinic.custom_price_amount is not None:
        return clinic.custom_price_amount
    if plan is None:
        return None
    per_device, minimum = _plan_rates(plan, clinic.billing_period_months)
    return max(per_device * max(device_count, 0), minimum)


def discount_ends_at(clinic) -> datetime | None:
    if not clinic.discount_percent or not clinic.discount_months or clinic.discount_started_at is None:
        return None
    return add_months(clinic.discount_started_at, clinic.discount_months)


def is_in_discount(clinic, now: datetime | None = None) -> bool:
    ends = discount_ends_at(clinic)
    return ends is not None and _now(now) < ends


def effective_price(clinic, plan, device_count: int, now: datetime | None = None) -> int | None:
    """What the clinic actually owes this period."""
    base = list_price(clinic, plan, device_count)
    if base is None:
        return None
    if is_in_discount(clinic, now):
        # Integer floor: prices are whole so'm, and rounding the customer's way on a
        # fraction of a so'm is not worth a Decimal dependency.
        return base - (base * clinic.discount_percent // 100)
    return base


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
