"""DB access for the Room table. Every clinic-scoped lookup takes clinic_id as a
required parameter and filters on it directly in the query, so a cross-tenant row
can never be returned by accident."""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Room


def count_by_clinic(db: Session) -> dict[int, int]:
    """One grouped query for the superadmin clinics list (avoids a COUNT per clinic)."""
    rows = db.execute(select(Room.clinic_id, func.count()).group_by(Room.clinic_id)).all()
    return {clinic_id: count for clinic_id, count in rows}


def list_by_clinic(db: Session, clinic_id: int) -> list[Room]:
    return list(
        db.scalars(
            select(Room).where(Room.clinic_id == clinic_id).order_by(Room.floor, Room.room_number)
        ).all()
    )


def get(db: Session, clinic_id: int, room_id: int) -> Room | None:
    return db.scalar(select(Room).where(Room.id == room_id, Room.clinic_id == clinic_id))


def create(db: Session, clinic_id: int, *, room_number: str, floor: int) -> Room:
    room = Room(clinic_id=clinic_id, room_number=room_number, floor=floor)
    db.add(room)
    db.flush()
    return room


def delete(db: Session, room: Room) -> None:
    from sqlalchemy import delete as delete_stmt
    from app.models import Button, Call
    db.execute(delete_stmt(Button).where(Button.room_id == room.id))
    db.execute(delete_stmt(Call).where(Call.room_id == room.id))
    db.delete(room)
