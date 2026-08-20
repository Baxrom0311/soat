from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser, get_clinic_user, get_db
from app.schemas.button import UnassignedSignalOut
from app.services import unassigned_service

router = APIRouter(prefix="/api/v1/unassigned-signals", tags=["unassigned-signals"])


@router.get("", response_model=list[UnassignedSignalOut])
def list_unassigned(user: CurrentUser = Depends(get_clinic_user), db: Session = Depends(get_db)):
    return unassigned_service.list_unassigned(db, user.clinic_id)
