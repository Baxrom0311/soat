from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser, require_admin, get_db
from app.schemas.button import UnassignedSignalOut
from app.services import unassigned_service

router = APIRouter(prefix="/api/v1/unassigned-signals", tags=["unassigned-signals"])


@router.get("", response_model=list[UnassignedSignalOut])
def list_unassigned(user: CurrentUser = Depends(require_admin), db: Session = Depends(get_db)):
    return unassigned_service.list_unassigned(db, user.clinic_id)


@router.delete("/{signal_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_unassigned_signal(
    signal_id: int, user: CurrentUser = Depends(require_admin), db: Session = Depends(get_db)
):
    unassigned_service.delete_unassigned(db, user.clinic_id, signal_id)


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
def clear_all_unassigned_signals(
    user: CurrentUser = Depends(require_admin), db: Session = Depends(get_db)
):
    unassigned_service.clear_all_unassigned(db, user.clinic_id)
