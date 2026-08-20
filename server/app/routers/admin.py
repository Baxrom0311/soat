from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser, get_db, require_superadmin
from app.schemas.admin import (
    AdminClinicAdminCreate,
    AdminClinicAdminOut,
    AdminClinicCreate,
    AdminClinicListItem,
    AdminClinicUpdate,
    AdminDeviceCreate,
    AdminDeviceOut,
    AdminOverviewOut,
    PaymentCreate,
    PaymentOut,
    PlanCreate,
    PlanOut,
    PlanUpdate,
)
from app.schemas.device import ClaimDeviceIn, ClaimDeviceOut, DeviceCreateOut, DiscoveredDeviceOut
from app.services import admin_service, discovered_device_service

# every route here is superadmin-only, so the guard lives on the router itself
router = APIRouter(
    prefix="/api/v1/admin", tags=["admin"], dependencies=[Depends(require_superadmin)]
)


@router.get("/overview", response_model=AdminOverviewOut)
def overview(db: Session = Depends(get_db)):
    return admin_service.overview(db)


# ---- Plans (tariff rejalari) ----
@router.get("/plans", response_model=list[PlanOut])
def list_plans(db: Session = Depends(get_db)):
    return admin_service.list_plans(db)


@router.post("/plans", response_model=PlanOut, status_code=201)
def create_plan(body: PlanCreate, db: Session = Depends(get_db)):
    return admin_service.create_plan(
        db,
        name=body.name,
        price_amount=body.price_amount,
        currency=body.currency,
        billing_period_months=body.billing_period_months,
        max_devices=body.max_devices,
    )


@router.patch("/plans/{plan_id}", response_model=PlanOut)
def update_plan(plan_id: int, body: PlanUpdate, db: Session = Depends(get_db)):
    return admin_service.update_plan(db, plan_id, changes=body.model_dump(exclude_unset=True))


@router.delete("/plans/{plan_id}", status_code=204)
def delete_plan(plan_id: int, db: Session = Depends(get_db)):
    admin_service.delete_plan(db, plan_id)


@router.get("/clinics", response_model=list[AdminClinicListItem])
def list_clinics(db: Session = Depends(get_db)):
    return admin_service.list_clinics(db)


@router.post("/clinics", response_model=AdminClinicListItem, status_code=201)
def create_clinic(body: AdminClinicCreate, db: Session = Depends(get_db)):
    return admin_service.create_clinic(db, name=body.name)


@router.patch("/clinics/{clinic_id}", response_model=AdminClinicListItem)
def update_clinic(clinic_id: int, body: AdminClinicUpdate, db: Session = Depends(get_db)):
    return admin_service.update_clinic(
        db,
        clinic_id,
        name=body.name,
        subscription_status=body.subscription_status,
        plan_id=body.plan_id,
        clear_plan=body.clear_plan,
        custom_price_amount=body.custom_price_amount,
        clear_custom_price=body.clear_custom_price,
    )


# ---- Payments (to'lovlar) ----
@router.get("/clinics/{clinic_id}/payments", response_model=list[PaymentOut])
def list_payments(clinic_id: int, db: Session = Depends(get_db)):
    return admin_service.list_payments(db, clinic_id)


@router.post("/clinics/{clinic_id}/payments", response_model=PaymentOut, status_code=201)
def record_payment(
    clinic_id: int,
    body: PaymentCreate,
    user: CurrentUser = Depends(require_superadmin),
    db: Session = Depends(get_db),
):
    return admin_service.record_payment(
        db,
        clinic_id,
        amount=body.amount,
        period_months=body.period_months,
        note=body.note,
        recorded_by=user.name or user.email,
    )


@router.post("/clinics/{clinic_id}/admins", response_model=AdminClinicAdminOut, status_code=201)
def create_clinic_admin(clinic_id: int, body: AdminClinicAdminCreate, db: Session = Depends(get_db)):
    staff = admin_service.create_clinic_admin(
        db, clinic_id, email=body.email, password=body.password, name=body.name
    )
    return AdminClinicAdminOut(id=staff.id, email=staff.email, name=staff.name, role=staff.role)


@router.get("/devices", response_model=list[AdminDeviceOut])
def list_devices(clinic_id: int | None = None, db: Session = Depends(get_db)):
    return admin_service.list_fleet_devices(db, clinic_id)


@router.post("/devices", response_model=DeviceCreateOut, status_code=201)
def create_device(body: AdminDeviceCreate, db: Session = Depends(get_db)):
    # plaintext_key is only ever returned here — it is not recoverable afterwards
    device, plaintext_key = admin_service.register_fleet_device(
        db, clinic_id=body.clinic_id, device_id=body.device_id, floor=body.floor
    )
    return DeviceCreateOut(device_id=device.device_id, device_api_key=plaintext_key)


@router.get("/discovered-devices", response_model=list[DiscoveredDeviceOut])
def list_discovered_devices(db: Session = Depends(get_db)):
    return discovered_device_service.list_discovered(db)


@router.post("/discovered-devices/{chip_id}/claim", response_model=ClaimDeviceOut)
def claim_discovered_device(chip_id: str, body: ClaimDeviceIn, db: Session = Depends(get_db)):
    # No key in the response: it never touches the dashboard, only the ESP32 itself
    # gets it later, over /devices/announce.
    return discovered_device_service.claim(
        db,
        chip_id=chip_id.strip().lower(),
        clinic_id=body.clinic_id,
        floor=body.floor,
        device_id=body.device_id,
    )
