from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser, get_clinic_user, get_db
from app.schemas.clinic import ClinicOut
from app.services import clinic_service

router = APIRouter(prefix="/api/v1/clinic", tags=["clinic"])


@router.get("/me", response_model=ClinicOut)
def get_my_clinic(user: CurrentUser = Depends(get_clinic_user), db: Session = Depends(get_db)):
    return clinic_service.get_my_clinic(db, user.clinic_id)
