from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.repositories import unassigned_repo
from app.schemas.button import UnassignedSignalOut


def list_unassigned(db: Session, clinic_id: int) -> list[UnassignedSignalOut]:
    rows = unassigned_repo.list_with_device_by_clinic(db, clinic_id)
    return [
        UnassignedSignalOut(
            id=sig.id,
            device_id=device.device_id,
            ev1527_code=sig.ev1527_code,
            first_seen_at=sig.first_seen_at,
            last_seen_at=sig.last_seen_at,
            seen_count=sig.seen_count,
        )
        for sig, device in rows
    ]


def delete_unassigned(db: Session, clinic_id: int, signal_id: int) -> None:
    deleted = unassigned_repo.delete_by_id(db, clinic_id, signal_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Signal not found")


def clear_all_unassigned(db: Session, clinic_id: int) -> int:
    return unassigned_repo.delete_all_by_clinic(db, clinic_id)
