from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser, get_clinic_user, get_db, require_admin
from app.schemas.room import RoomCreate, RoomOut, RoomUpdate
from app.services import room_service

router = APIRouter(prefix="/api/v1/rooms", tags=["rooms"])


@router.get("", response_model=list[RoomOut])
def list_rooms(user: CurrentUser = Depends(get_clinic_user), db: Session = Depends(get_db)):
    return room_service.list_rooms(db, user.clinic_id)


@router.post("", response_model=RoomOut, status_code=201)
def create_room(
    body: RoomCreate,
    user: CurrentUser = Depends(require_admin),
    db: Session = Depends(get_db),
):
    return room_service.create_room(db, user.clinic_id, room_number=body.room_number, floor=body.floor)


@router.patch("/{room_id}", response_model=RoomOut)
def update_room(
    room_id: int,
    body: RoomUpdate,
    user: CurrentUser = Depends(require_admin),
    db: Session = Depends(get_db),
):
    return room_service.update_room(
        db, user.clinic_id, room_id, room_number=body.room_number, floor=body.floor
    )


@router.delete("/{room_id}", status_code=204)
def delete_room(
    room_id: int,
    user: CurrentUser = Depends(require_admin),
    db: Session = Depends(get_db),
):
    room_service.delete_room(db, user.clinic_id, room_id)
