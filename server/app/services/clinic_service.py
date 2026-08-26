"""Clinic-facing reads: the clinic's own profile, its subscription state and its bill.

Every route served from here is reachable while the clinic is BLOCKED (see
core.deps.get_clinic_user_ungated) -- this is the screen a blocked clinic uses to find
out what it owes and how to get unblocked.
"""

import html
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core import billing
from app.core.config import (
    VENDOR_ADDRESS,
    VENDOR_BANK_DETAILS,
    VENDOR_LEGAL_NAME,
    VENDOR_PHONE,
    VENDOR_TAX_ID,
)
from app.models import Clinic, Plan
from app.repositories import clinic_repo, device_repo, plan_repo
from app.schemas.clinic import ClinicBillingNotice, ClinicBillingOut, ClinicOut


def _facts(db: Session, clinic_id: int) -> tuple[Clinic, Plan | None, int, datetime]:
    clinic = clinic_repo.get(db, clinic_id)
    if clinic is None:
        raise HTTPException(status_code=404, detail="Clinic not found")
    plan = plan_repo.get(db, clinic.plan_id) if clinic.plan_id else None
    # Same grouped-count helper the superadmin clinics list uses, rather than a
    # per-request COUNT (see device_service.py).
    device_count = device_repo.count_by_clinic(db).get(clinic_id, 0)
    return clinic, plan, device_count, datetime.now(timezone.utc)


def get_my_clinic(db: Session, clinic_id: int) -> ClinicOut:
    clinic = clinic_repo.get(db, clinic_id)
    if clinic is None:
        raise HTTPException(status_code=404, detail="Clinic not found")
    return ClinicOut(
        id=clinic.id,
        name=clinic.name,
        subscription_status=clinic.subscription_status,
        effective_status=billing.effective_status(clinic),
        created_at=clinic.created_at,
    )


def get_billing(db: Session, clinic_id: int) -> ClinicBillingOut:
    clinic, plan, device_count, now = _facts(db, clinic_id)
    return ClinicBillingOut(
        effective_status=billing.effective_status(clinic, now),
        paid_until=clinic.paid_until,
        days_until_expiry=billing.days_until_expiry(clinic, now),
        blocked_at=billing.blocked_at(clinic),
        is_blocked=billing.is_blocked(clinic, now),
        is_in_grace=billing.is_in_grace(clinic, now),
        billing_period_months=clinic.billing_period_months,
        currency=plan.currency if plan else "UZS",
        list_price=billing.list_price(clinic, plan, device_count),
        effective_price=billing.effective_price(clinic, plan, device_count, now),
        device_count=device_count,
        discount_percent=clinic.discount_percent if billing.is_in_discount(clinic, now) else None,
        discount_ends_at=billing.discount_ends_at(clinic),
        plan_name=plan.name if plan else None,
        needs_warning=billing.needs_expiry_warning(clinic, now),
    )


def get_billing_notice(db: Session, clinic_id: int) -> ClinicBillingNotice:
    clinic = clinic_repo.get(db, clinic_id)
    if clinic is None:
        raise HTTPException(status_code=404, detail="Clinic not found")
    now = datetime.now(timezone.utc)
    return ClinicBillingNotice(
        warn=billing.needs_expiry_warning(clinic, now),
        days_left=billing.days_until_expiry(clinic, now),
        blocked=billing.is_blocked(clinic, now),
    )


# ----------------------------------------------------------------------------- bill
# Server-rendered HTML with print CSS instead of a generated PDF: the browser's own
# "Print -> Save as PDF" produces the same artefact, and a PDF library (reportlab &c)
# would cost tens of MB of resident memory on a 961MB droplet that is already using
# swap -- not a trade worth making for a single one-page document.


def _money(amount: int | None) -> str:
    if amount is None:
        return "—"
    return f"{amount:,}".replace(",", " ")


def _date(value: datetime | None) -> str:
    return value.strftime("%d.%m.%Y") if value else "—"


def _period_label(months: int) -> str:
    if months >= billing.ANNUAL_PERIOD_MONTHS:
        return f"1 yil ({months} oy)"
    if months == 1:
        return "1 oy"
    return f"{months} oy"


def _unit_price(clinic: Clinic, plan: Plan | None) -> int | None:
    if plan is None:
        return None
    if clinic.billing_period_months >= billing.ANNUAL_PERIOD_MONTHS:
        return plan.price_per_device_annual
    return plan.price_per_device_monthly


def _row(label: str, value: str) -> str:
    return f"<tr><th>{html.escape(label)}</th><td>{html.escape(value)}</td></tr>"


def _vendor_rows() -> str:
    """Only non-empty vendor details are printed -- an empty "STIR:" line would make the
    page look like a half-filled legal invoice, which this document is not."""
    fields = [
        ("Tashkilot", VENDOR_LEGAL_NAME),
        ("STIR (INN)", VENDOR_TAX_ID),
        ("Bank ma'lumotlari", VENDOR_BANK_DETAILS),
        ("Manzil", VENDOR_ADDRESS),
        ("Telefon", VENDOR_PHONE),
    ]
    return "".join(_row(label, value) for label, value in fields if value)


def render_bill_html(db: Session, clinic_id: int) -> str:
    clinic, plan, device_count, now = _facts(db, clinic_id)
    currency = plan.currency if plan else "UZS"
    list_amount = billing.list_price(clinic, plan, device_count)
    total = billing.effective_price(clinic, plan, device_count, now)
    unit = _unit_price(clinic, plan)

    rows = [
        _row("Klinika", clinic.name),
        _row("Hisob sanasi", _date(now)),
        _row("Tarif", plan.name if plan else "—"),
        _row("Hisob-kitob davri", _period_label(clinic.billing_period_months)),
        _row("Qurilmalar (qabul qilgich) soni", str(device_count)),
    ]
    if clinic.custom_price_amount is not None:
        rows.append(_row("Kelishilgan narx", f"{_money(clinic.custom_price_amount)} {currency}"))
    else:
        rows.append(_row("Bitta qurilma narxi", f"{_money(unit)} {currency}"))
    rows.append(_row("Summa (chegirmasiz)", f"{_money(list_amount)} {currency}"))
    if billing.is_in_discount(clinic, now):
        rows.append(_row("Chegirma", f"{clinic.discount_percent}%"))
        rows.append(_row("Chegirma tugash sanasi", _date(billing.discount_ends_at(clinic))))
    rows.append(_row("To'langan muddat (shu sanagacha)", _date(clinic.paid_until)))

    vendor = _vendor_rows()
    vendor_block = (
        f"<h2>To'lov qabul qiluvchi</h2><table>{vendor}</table>" if vendor else ""
    )

    return f"""<!DOCTYPE html>
<html lang="uz">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Hisob — {html.escape(clinic.name)}</title>
<style>
  body {{ font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
         color: #111; margin: 0; padding: 24px; }}
  .sheet {{ max-width: 720px; margin: 0 auto; }}
  h1 {{ font-size: 22px; margin: 0 0 4px; }}
  h2 {{ font-size: 15px; margin: 24px 0 8px; text-transform: uppercase;
        letter-spacing: .04em; color: #555; }}
  .muted {{ color: #666; font-size: 13px; margin: 0 0 16px; }}
  table {{ width: 100%; border-collapse: collapse; }}
  th, td {{ text-align: left; padding: 8px 4px; border-bottom: 1px solid #e5e5e5;
            font-size: 14px; vertical-align: top; }}
  th {{ width: 45%; font-weight: 500; color: #555; }}
  .total {{ margin-top: 20px; padding-top: 12px; border-top: 2px solid #111;
            display: flex; justify-content: space-between; font-size: 18px;
            font-weight: 600; }}
  .note {{ margin-top: 28px; font-size: 12px; color: #777; }}
  @media print {{
    body {{ padding: 0; }}
    .no-print {{ display: none; }}
    @page {{ margin: 16mm; }}
  }}
</style>
</head>
<body>
<div class="sheet">
  <h1>Hisob</h1>
  <p class="muted">Obuna to'lovi uchun hisob. Bu hujjat hisob-faktura emas.</p>
  <table>{"".join(rows)}</table>
  <div class="total"><span>Jami to'lov</span><span>{_money(total)} {html.escape(currency)}</span></div>
  {vendor_block}
  <p class="note">Savollar bo'lsa yuqoridagi telefon raqamiga murojaat qiling.
  Hujjatni saqlash uchun brauzerdan "Chop etish → PDF sifatida saqlash"ni tanlang.</p>
</div>
</body>
</html>"""
