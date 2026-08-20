from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser, get_clinic_user, get_db, require_admin
from app.schemas.button import ButtonCreate, ButtonOut
from app.services import button_service

router = APIRouter(prefix="/api/v1/buttons", tags=["buttons"])


@router.get("", response_model=list[ButtonOut])
def list_buttons(user: CurrentUser = Depends(get_clinic_user), db: Session = Depends(get_db)):
    return button_service.list_buttons(db, user.clinic_id)


@router.post("", response_model=ButtonOut, status_code=201)
async def create_button(
    body: ButtonCreate,
    user: CurrentUser = Depends(require_admin),  # rebinding buttons re-routes alarms — admin only
    db: Session = Depends(get_db),
):
    return await button_service.create_button(db, user.clinic_id, room_id=body.room_id, ev1527_code=body.ev1527_code)


@router.delete("/{button_id}", status_code=204)
def delete_button(
    button_id: int,
    user: CurrentUser = Depends(require_admin),
    db: Session = Depends(get_db),
):
    button_service.delete_button(db, user.clinic_id, button_id)
