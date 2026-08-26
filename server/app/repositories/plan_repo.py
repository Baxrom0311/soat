"""DB access for the Plan table."""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Plan


def create(
    db: Session,
    *,
    name: str,
    currency: str,
    price_per_device_monthly: int,
    price_per_device_annual: int,
    min_price_monthly: int,
    min_price_annual: int,
) -> Plan:
    plan = Plan(
        name=name,
        currency=currency,
        price_per_device_monthly=price_per_device_monthly,
        price_per_device_annual=price_per_device_annual,
        min_price_monthly=min_price_monthly,
        min_price_annual=min_price_annual,
    )
    db.add(plan)
    db.flush()
    return plan


def get(db: Session, plan_id: int) -> Plan | None:
    return db.get(Plan, plan_id)


def list_all(db: Session) -> list[Plan]:
    return list(db.scalars(select(Plan).order_by(Plan.id)).all())


def get_map(db: Session) -> dict[int, Plan]:
    """id -> Plan, for decorating clinic lists without an N+1."""
    return {plan.id: plan for plan in db.scalars(select(Plan)).all()}


def count_clinics_on_plan(db: Session, plan_id: int) -> int:
    from app.models import Clinic

    return db.scalar(select(func.count()).select_from(Clinic).where(Clinic.plan_id == plan_id))
