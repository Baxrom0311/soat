"""DB access for the Call table."""

from datetime import datetime, timezone

from sqlalchemy import func, select, text, update
from sqlalchemy.orm import Session

from app.enums import CallStatus
from app.models import Call, Device, Room


def create(
    db: Session, clinic_id: int, *, room_id: int, device_id: int, press_id: str | None = None
) -> Call:
    call = Call(
        clinic_id=clinic_id, room_id=room_id, device_id=device_id, status=CallStatus.ACTIVE, press_id=press_id
    )
    db.add(call)
    db.flush()
    return call


def get_by_press_id(db: Session, clinic_id: int, press_id: str) -> Call | None:
    return db.scalar(select(Call).where(Call.press_id == press_id, Call.clinic_id == clinic_id))


def get(db: Session, clinic_id: int, call_id: int) -> Call | None:
    return db.scalar(select(Call).where(Call.id == call_id, Call.clinic_id == clinic_id))


def lock_room(db: Session, clinic_id: int, room_id: int) -> None:
    """Serializes concurrent call ingestion for one room via the two-int advisory lock
    (RF buttons retransmit, so near-simultaneous duplicate POSTs are the norm).
    Held until the surrounding transaction commits or rolls back."""
    db.execute(
        text("SELECT pg_advisory_xact_lock((:clinic_id)::int, (:room_id)::int)"),
        {"clinic_id": clinic_id, "room_id": room_id},
    )


def get_active_by_room(db: Session, clinic_id: int, room_id: int) -> Call | None:
    return db.scalar(
        select(Call)
        .where(Call.clinic_id == clinic_id, Call.room_id == room_id, Call.status == CallStatus.ACTIVE)
        .order_by(Call.created_at.desc())
        .limit(1)
    )


def count_active_by_clinic(db: Session) -> dict[int, int]:
    """One grouped query for the superadmin clinics list (avoids a COUNT per clinic)."""
    rows = db.execute(
        select(Call.clinic_id, func.count()).where(Call.status == CallStatus.ACTIVE).group_by(Call.clinic_id)
    ).all()
    return {clinic_id: count for clinic_id, count in rows}


def list_active_with_room_by_clinic(db: Session, clinic_id: int) -> list[tuple[Call, Room]]:
    rows = db.execute(
        select(Call, Room)
        .join(Room, Call.room_id == Room.id)
        .where(Call.clinic_id == clinic_id, Call.status == CallStatus.ACTIVE)
        .order_by(Call.created_at.asc())
    ).all()
    return [(call, room) for call, room in rows]


def list_history_with_room_device_by_clinic(
    db: Session, clinic_id: int, *, limit: int, floors: list[int] | None = None
) -> list[tuple[Call, Room, Device | None]]:
    # floors filter must apply BEFORE the LIMIT (in SQL, not in Python after fetching):
    # otherwise a floor-restricted nurse's most recent floor calls could sit past the
    # clinic-wide top-`limit` rows and never show up at all.
    query = (
        select(Call, Room, Device)
        .join(Room, Call.room_id == Room.id)
        # outerjoin, not join: a call whose receiver has since been deleted keeps its
        # device_id NULL (migration 0008), and an inner join would drop exactly those
        # rows -- quietly hiding real history from the ward that lived it.
        .outerjoin(Device, Call.device_id == Device.id)
        .where(Call.clinic_id == clinic_id)
    )
    if floors is not None:
        query = query.where(Room.floor.in_(floors))
    rows = db.execute(query.order_by(Call.created_at.desc()).limit(limit)).all()
    return [(call, room, device) for call, room, device in rows]


def expire_stale(db: Session, *, older_than: datetime) -> int:
    """Close every active call created before `older_than`. Returns how many.

    One statement, so there is no window in which a nurse's acknowledgement and this
    both land: the WHERE insists on ACTIVE, exactly as acknowledge_if_active does, and
    whichever reaches the row first wins. A nurse answering at the stroke of the
    deadline is credited with the answer; the clock never overwrites her name.

    Deliberately leaves acknowledged_at and acknowledged_by NULL. Every answer-time
    figure in the product is computed from acknowledged_at, so an expired call is
    excluded from them by construction rather than by every caller remembering to.
    """
    result = db.execute(
        update(Call)
        .where(Call.status == CallStatus.ACTIVE, Call.created_at < older_than)
        .values(status=CallStatus.EXPIRED)
    )
    return result.rowcount


def count_expired_by_clinic(db: Session, *, since: datetime) -> list[tuple[int, int]]:
    """(clinic_id, count) of calls that expired unanswered since `since`.

    The number a clinic should be shown: not a performance score, but the count of
    patients who pressed a button and whose call was never closed by anyone.
    """
    rows = db.execute(
        select(Call.clinic_id, func.count())
        .where(Call.status == CallStatus.EXPIRED, Call.created_at >= since)
        .group_by(Call.clinic_id)
    ).all()
    return [(clinic_id, count) for clinic_id, count in rows]


def acknowledge_if_active(db: Session, clinic_id: int, call_id: int, *, acknowledged_by: str) -> bool:
    """Atomic check-and-set: only flips an *active* call, so two concurrent acks can't
    both succeed (the loser sees rowcount 0 and surfaces a 409). clinic_id is required
    here too (not just in the preceding call_repo.get lookup) so correctness never
    depends on every future caller remembering to check tenancy before this write."""
    result = db.execute(
        update(Call)
        .where(Call.id == call_id, Call.clinic_id == clinic_id, Call.status == CallStatus.ACTIVE)
        .values(
            status=CallStatus.ACKNOWLEDGED,
            acknowledged_at=datetime.now(timezone.utc),
            acknowledged_by=acknowledged_by,
        )
    )
    return result.rowcount == 1
