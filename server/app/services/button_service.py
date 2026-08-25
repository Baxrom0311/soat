from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.repositories import button_repo, room_repo, unassigned_repo
from app.schemas.button import ButtonOut
from app.ws_manager import manager


def list_buttons(db: Session, clinic_id: int) -> list[ButtonOut]:
    rows = button_repo.list_with_room_by_clinic(db, clinic_id)
    return [
        ButtonOut(id=btn.id, room_id=room.id, room_number=room.room_number, floor=room.floor, ev1527_code=btn.ev1527_code)
        for btn, room in rows
    ]


async def create_button(db: Session, clinic_id: int, *, room_id: int, ev1527_code: int) -> ButtonOut:
    room = room_repo.get(db, clinic_id, room_id)
    if room is None:
        raise HTTPException(status_code=404, detail="Room not found")

    try:
        # the repo flushes on create, so the duplicate-key error surfaces here
        button = button_repo.create(db, clinic_id, room_id=room.id, ev1527_code=ev1527_code)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="ev1527_code already bound in this clinic")

    # clear the pending "unknown signal" entry now that it's mapped to a room
    unassigned_repo.delete_by_code(db, clinic_id, ev1527_code)
    db.commit()
    db.refresh(button)

    # after commit, so dashboards never drop a signal the DB still holds
    await manager.broadcast(clinic_id, {"type": "unassigned_removed", "ev1527_code": ev1527_code})

    return ButtonOut(
        id=button.id, room_id=room.id, room_number=room.room_number, floor=room.floor, ev1527_code=button.ev1527_code
    )


def update_button(db: Session, clinic_id: int, button_id: int, *, room_id: int) -> ButtonOut:
    """Rebinds an already-bound button to a different room, without a delete+recreate
    round trip through the unassigned-signals list."""
    button = button_repo.get(db, clinic_id, button_id)
    if button is None:
        raise HTTPException(status_code=404, detail="Button not found")
    room = room_repo.get(db, clinic_id, room_id)
    if room is None:
        raise HTTPException(status_code=404, detail="Room not found")
    button.room_id = room.id
    db.commit()
    db.refresh(button)
    return ButtonOut(
        id=button.id, room_id=room.id, room_number=room.room_number, floor=room.floor, ev1527_code=button.ev1527_code
    )


def delete_button(db: Session, clinic_id: int, button_id: int) -> None:
    # calls reference room_id/device_id (not the button), so history survives deletion
    button = button_repo.get(db, clinic_id, button_id)
    if button is None:
        raise HTTPException(status_code=404, detail="Button not found")
    button_repo.delete(db, button)
    db.commit()
