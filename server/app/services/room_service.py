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
