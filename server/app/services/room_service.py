from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models import Room
from app.repositories import room_repo


def list_rooms(db: Session, clinic_id: int) -> list[Room]:
    return room_repo.list_by_clinic(db, clinic_id)


def create_room(db: Session, clinic_id: int, *, room_number: str, floor: int) -> Room:
    room = room_repo.create(db, clinic_id, room_number=room_number, floor=floor)
    db.commit()
    db.refresh(room)
    return room


def update_room(
    db: Session, clinic_id: int, room_id: int, *, room_number: str | None, floor: int | None
) -> Room:
    room = room_repo.get(db, clinic_id, room_id)
    if room is None:
        raise HTTPException(status_code=404, detail="Room not found")
    if room_number is not None:
        room.room_number = room_number
    if floor is not None:
        room.floor = floor
    db.commit()
    db.refresh(room)
    return room
