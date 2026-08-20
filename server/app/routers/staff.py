from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser, get_clinic_user, get_db, require_admin
from app.schemas.staff import StaffCreate, StaffOut
from app.services import staff_service

router = APIRouter(prefix="/api/v1/staff", tags=["staff"])


@router.get("", response_model=list[StaffOut])
def list_staff(user: CurrentUser = Depends(get_clinic_user), db: Session = Depends(get_db)):
    return staff_service.list_staff(db, user.clinic_id)


@router.post("", response_model=StaffOut, status_code=201)
def create_staff(
    body: StaffCreate,
    user: CurrentUser = Depends(require_admin),
    db: Session = Depends(get_db),
):
    return staff_service.create_staff(
        db, user.clinic_id, email=body.email, password=body.password, role=body.role, name=body.name
    )
