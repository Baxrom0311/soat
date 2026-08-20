"""DB access for the Button table."""

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models import Button, Room


def list_with_room_by_clinic(db: Session, clinic_id: int) -> list[tuple[Button, Room]]:
    rows = db.execute(
        select(Button, Room)
        .join(Room, Button.room_id == Room.id)
        .where(Button.clinic_id == clinic_id)
        .order_by(Room.floor, Room.room_number)
    ).all()
    return [(btn, room) for btn, room in rows]


def get_by_code(db: Session, clinic_id: int, ev1527_code: int) -> tuple[Button, Room] | None:
    row = db.execute(
        select(Button, Room)
        .join(Room, Button.room_id == Room.id)
        .where(Button.clinic_id == clinic_id, Button.ev1527_code == ev1527_code)
    ).first()
    return (row.Button, row.Room) if row else None


def get(db: Session, clinic_id: int, button_id: int) -> Button | None:
    return db.scalar(select(Button).where(Button.id == button_id, Button.clinic_id == clinic_id))


def create(db: Session, clinic_id: int, *, room_id: int, ev1527_code: int) -> Button:
    button = Button(clinic_id=clinic_id, room_id=room_id, ev1527_code=ev1527_code)
    db.add(button)
    db.flush()
    return button


def delete(db: Session, button: Button) -> None:
    db.delete(button)
