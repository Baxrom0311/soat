"""DB access for per-nurse floor assignment (StaffFloorAssignment).

An empty assignment set means "unrestricted" (sees/gets notified of every floor) --
see Staff.floors. get_visible_floors below is the single source of truth for that
rule so call_service and push_service can't drift out of sync on it.
"""

from sqlalchemy import delete as sa_delete, or_, select
from sqlalchemy.orm import Session

from app.enums import StaffRole
from app.models import Staff, StaffFloorAssignment


def list_floors_by_staff(db: Session, staff_id: int) -> list[int]:
    return list(
        db.scalars(
            select(StaffFloorAssignment.floor)
            .where(StaffFloorAssignment.staff_id == staff_id)
            .order_by(StaffFloorAssignment.floor)
        ).all()
    )


def set_floors(db: Session, staff_id: int, floors: list[int]) -> None:
    """Replaces the full assignment set for this staff member."""
    db.execute(sa_delete(StaffFloorAssignment).where(StaffFloorAssignment.staff_id == staff_id))
    for floor in sorted(set(floors)):
        db.add(StaffFloorAssignment(staff_id=staff_id, floor=floor))
    db.flush()


def get_visible_floors(db: Session, staff_id: int, role: str) -> list[int] | None:
    """None == unrestricted (admin/superadmin, or a nurse with no floors assigned yet).
    A list means the caller must only see calls whose room.floor is in it."""
    if role in (StaffRole.ADMIN.value, StaffRole.SUPERADMIN.value):
        return None
    floors = list_floors_by_staff(db, staff_id)
    return floors or None


def visible_staff_ids_for_floor(db: Session, clinic_id: int, floor: int):
    """Query (not a list) of staff.id in this clinic who should be notified/see a call
    on this floor: admins, nurses with no floor assignments at all, and nurses whose
    assignments include this exact floor."""
    assigned_staff_ids = select(StaffFloorAssignment.staff_id).distinct()
    return select(Staff.id).where(
        Staff.clinic_id == clinic_id,
        or_(
            Staff.role == StaffRole.ADMIN,
            Staff.id.not_in(assigned_staff_ids),
            Staff.id.in_(
                select(StaffFloorAssignment.staff_id).where(StaffFloorAssignment.floor == floor)
            ),
        ),
    )
