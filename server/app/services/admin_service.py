"""Superadmin (platform-level) business logic: clinic provisioning, subscription
control, billing (plans + payments) and the cross-clinic fleet views. Everything here
is deliberately NOT clinic-scoped — the /api/v1/admin router gates access with
require_superadmin."""

import secrets
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core import billing
from app.models import Clinic, Device, Payment, Plan, Staff
from app.repositories import (
    call_repo,
    clinic_repo,
    device_repo,
    payment_repo,
    plan_repo,
    room_repo,
    staff_repo,
)
from app.schemas.admin import (
    AdminClinicListItem,
    AdminDeviceOut,
    AdminOverviewOut,
    ClinicBilling,
    PaymentOut,
    PlanOut,
)
from app.core.security import hash_password
from app.services import device_service, staff_service

VALID_SUBSCRIPTION_STATUSES = ("trial", "active", "suspended")


def overview(db: Session) -> AdminOverviewOut:
    return AdminOverviewOut(
        clinics=clinic_repo.count_all(db),
        devices_total=device_repo.count_all(db),
        devices_online=device_repo.count_online_since(db, device_service.online_cutoff()),
        active_calls_total=call_repo.count_active(db),
    )


# ---------------------------------------------------------------- Plans


def list_plans(db: Session) -> list[PlanOut]:
    return [PlanOut.model_validate(p) for p in plan_repo.list_all(db)]


def create_plan(
    db: Session,
    *,
    name: str,
    price_amount: int,
    currency: str,
    billing_period_months: int,
    max_devices: int | None,
) -> Plan:
    try:
        plan = plan_repo.create(
            db,
            name=name,
            price_amount=price_amount,
            currency=currency,
            billing_period_months=billing_period_months,
            max_devices=max_devices,
        )
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="A plan with this name already exists")
    db.refresh(plan)
    return plan


def update_plan(db: Session, plan_id: int, *, changes: dict) -> Plan:
    plan = plan_repo.get(db, plan_id)
    if plan is None:
        raise HTTPException(status_code=404, detail="Plan not found")
    # `changes` is already exclude_unset, so a present key was intentionally sent. Only
    # max_devices is nullable (null == unlimited); a null for any NOT NULL column is a
    # no-op rather than a 500.
    nullable = {"max_devices"}
    for field, value in changes.items():
        if value is None and field not in nullable:
            continue
        setattr(plan, field, value)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="A plan with this name already exists")
    db.refresh(plan)
    return plan


def delete_plan(db: Session, plan_id: int) -> None:
    plan = plan_repo.get(db, plan_id)
    if plan is None:
        raise HTTPException(status_code=404, detail="Plan not found")
    # Refuse to delete a plan that clinics still reference (would orphan their billing);
    # archive it instead by setting is_active=false.
    if plan_repo.count_clinics_on_plan(db, plan_id) > 0:
        raise HTTPException(
            status_code=409,
            detail="Plan is assigned to clinics — archive it (is_active=false) instead of deleting",
        )
    try:
        db.delete(plan)
        db.commit()
    except IntegrityError:
        # A clinic was assigned to this plan between the count check and the delete;
        # the FK rejects it — surface the same 409 instead of a raw 500.
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Plan is assigned to clinics — archive it (is_active=false) instead of deleting",
        )


# ---------------------------------------------------------------- Clinics


def _billing_view(clinic: Clinic, plans: dict[int, Plan], now: datetime) -> ClinicBilling:
    plan = plans.get(clinic.plan_id) if clinic.plan_id else None
    plan_price = plan.price_amount if plan else None
    return ClinicBilling(
        plan_id=clinic.plan_id,
        plan_name=plan.name if plan else None,
        effective_price=billing.effective_price(clinic, plan_price),
        custom_price_amount=clinic.custom_price_amount,
        currency=plan.currency if plan else "UZS",
        paid_until=clinic.paid_until,
        effective_status=billing.effective_status(clinic, now),
        max_devices=plan.max_devices if plan else None,
    )


def _list_item(
    clinic: Clinic,
    plans: dict[int, Plan],
    staff_counts: dict,
    device_counts: dict,
    room_counts: dict,
    active_calls: dict,
    now: datetime,
) -> AdminClinicListItem:
    return AdminClinicListItem(
        id=clinic.id,
        name=clinic.name,
        subscription_status=clinic.subscription_status,
        created_at=clinic.created_at,
        staff_count=staff_counts.get(clinic.id, 0),
        device_count=device_counts.get(clinic.id, 0),
        room_count=room_counts.get(clinic.id, 0),
        active_calls=active_calls.get(clinic.id, 0),
        billing=_billing_view(clinic, plans, now),
    )


def list_clinics(db: Session) -> list[AdminClinicListItem]:
    now = datetime.now(timezone.utc)
    clinics = clinic_repo.list_all(db)
    plans = plan_repo.get_map(db)
    staff_counts = staff_repo.count_by_clinic(db)
    device_counts = device_repo.count_by_clinic(db)
    room_counts = room_repo.count_by_clinic(db)
    active_calls = call_repo.count_active_by_clinic(db)
    return [
        _list_item(c, plans, staff_counts, device_counts, room_counts, active_calls, now)
        for c in clinics
    ]


def _one_list_item(db: Session, clinic: Clinic) -> AdminClinicListItem:
    now = datetime.now(timezone.utc)
    return _list_item(
        clinic,
        plan_repo.get_map(db),
        staff_repo.count_by_clinic(db),
        device_repo.count_by_clinic(db),
        room_repo.count_by_clinic(db),
        call_repo.count_active_by_clinic(db),
        now,
    )


def create_clinic(db: Session, *, name: str) -> AdminClinicListItem:
    clinic = clinic_repo.create(db, name=name)
    db.commit()
    db.refresh(clinic)
    return _one_list_item(db, clinic)


def update_clinic(
    db: Session,
    clinic_id: int,
    *,
    name: str | None,
    subscription_status: str | None,
    plan_id: int | None,
    clear_plan: bool,
    custom_price_amount: int | None,
    clear_custom_price: bool,
) -> AdminClinicListItem:
    clinic = clinic_repo.get(db, clinic_id)
    if clinic is None:
        raise HTTPException(status_code=404, detail="Clinic not found")
    if subscription_status is not None and subscription_status not in VALID_SUBSCRIPTION_STATUSES:
        raise HTTPException(
            status_code=422, detail="subscription_status must be one of trial|active|suspended"
        )
    if name is not None:
        clinic.name = name
    if subscription_status is not None:
        clinic.subscription_status = subscription_status

    if clear_plan:
        clinic.plan_id = None
    elif plan_id is not None:
        plan = plan_repo.get(db, plan_id)
        if plan is None:
            raise HTTPException(status_code=404, detail="Plan not found")
        # Archived plans keep working for clinics already on them, but can't be newly
        # assigned (unless the clinic is already on this exact plan).
        if not plan.is_active and clinic.plan_id != plan_id:
            raise HTTPException(status_code=409, detail="Plan is archived — reactivate it first")
        clinic.plan_id = plan_id

    if clear_custom_price:
        clinic.custom_price_amount = None
    elif custom_price_amount is not None:
        clinic.custom_price_amount = custom_price_amount

    db.commit()
    db.refresh(clinic)
    return _one_list_item(db, clinic)


def create_clinic_admin(db: Session, clinic_id: int, *, email: str, password: str, name: str) -> Staff:
    if clinic_repo.get(db, clinic_id) is None:
        raise HTTPException(status_code=404, detail="Clinic not found")
    # staff_service handles the duplicate-email 409 and password hashing
    return staff_service.create_staff(db, clinic_id, email=email, password=password, role="admin", name=name)


def list_clinic_staff(db: Session, clinic_id: int) -> list[Staff]:
    if clinic_repo.get(db, clinic_id) is None:
        raise HTTPException(status_code=404, detail="Clinic not found")
    return staff_service.list_staff(db, clinic_id)


def reset_staff_password(db: Session, clinic_id: int, staff_id: int) -> str:
    """Recovery path for a clinic locked out of its only admin account: generates a
    fresh random password, returns it once (never stored/logged in plaintext), the
    same one-time-reveal pattern already used for device API keys."""
    staff = staff_repo.get(db, clinic_id, staff_id)
    if staff is None:
        raise HTTPException(status_code=404, detail="Staff not found")
    new_password = secrets.token_urlsafe(9)
    staff.password_hash = hash_password(new_password)
    db.commit()
    return new_password


# ---------------------------------------------------------------- Payments


def record_payment(
    db: Session, clinic_id: int, *, amount: int, period_months: int, note: str | None, recorded_by: str | None
) -> PaymentOut:
    # Row-locked read: two overlapping payments (double-click / retry) would otherwise
    # both read the same paid_until and one would overwrite the other, losing a period.
    clinic = clinic_repo.get_for_update(db, clinic_id)
    if clinic is None:
        raise HTTPException(status_code=404, detail="Clinic not found")

    now = datetime.now(timezone.utc)
    # Extend from the later of "now" and the current paid-through date, so paying early
    # stacks onto the remaining time instead of throwing it away, while paying after a
    # lapse restarts from today.
    base = clinic.paid_until if (clinic.paid_until and clinic.paid_until > now) else now
    new_paid_until = billing.add_months(base, period_months)
    clinic.paid_until = new_paid_until
    # First payment activates a trial. A deliberate manual 'suspended' is left untouched
    # (only a manual reactivation clears it); an 'active' clinic stays active.
    if clinic.subscription_status == "trial":
        clinic.subscription_status = "active"

    payment = payment_repo.create(
        db,
        clinic_id=clinic_id,
        amount=amount,
        period_months=period_months,
        note=note,
        recorded_by=recorded_by,
        paid_until_after=new_paid_until,
    )
    db.commit()
    db.refresh(payment)
    return PaymentOut.model_validate(payment)


def list_payments(db: Session, clinic_id: int) -> list[PaymentOut]:
    if clinic_repo.get(db, clinic_id) is None:
        raise HTTPException(status_code=404, detail="Clinic not found")
    return [PaymentOut.model_validate(p) for p in payment_repo.list_by_clinic(db, clinic_id)]


# ---------------------------------------------------------------- Devices


def list_fleet_devices(db: Session, clinic_id: int | None = None) -> list[AdminDeviceOut]:
    rows = device_repo.list_with_clinic(db, clinic_id)
    return [
        AdminDeviceOut(
            id=device.id,
            clinic_id=device.clinic_id,
            clinic_name=clinic.name,
            device_id=device.device_id,
            floor=device.floor,
            created_at=device.created_at,
            last_seen_at=device.last_seen_at,
            online=device_service.is_device_online(device.last_seen_at),
        )
        for device, clinic in rows
    ]


def register_fleet_device(db: Session, *, clinic_id: int, device_id: str, floor: int) -> tuple[Device, str]:
    if clinic_repo.get(db, clinic_id) is None:
        raise HTTPException(status_code=404, detail="Clinic not found")
    # device_service handles key generation/hashing, the plan device-limit 409 and the
    # duplicate device_id 409
    return device_service.register_device(db, clinic_id, device_id=device_id, floor=floor)
