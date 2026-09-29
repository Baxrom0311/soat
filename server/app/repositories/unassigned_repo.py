"""DB access for the UnassignedSignal table."""

from datetime import datetime, timezone

from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.models import Button, Device, UnassignedSignal


def list_with_device_by_clinic(db: Session, clinic_id: int) -> list[tuple[UnassignedSignal, Device]]:
    bound_codes_subquery = (
        select(Button.ev1527_code)
        .where(Button.clinic_id == clinic_id)
        .scalar_subquery()
    )

    rows = db.execute(
        select(UnassignedSignal, Device)
        .join(Device, UnassignedSignal.device_id == Device.id)
        .where(
            UnassignedSignal.clinic_id == clinic_id,
            UnassignedSignal.ev1527_code.not_in(bound_codes_subquery),
        )
        .order_by(UnassignedSignal.last_seen_at.desc())
    ).all()
    return [(sig, device) for sig, device in rows]


def cleanup_bound_signals(db: Session, clinic_id: int) -> int:
    """Removes any unassigned_signals rows whose ev1527_code is already bound in buttons table."""
    bound_codes_subquery = (
        select(Button.ev1527_code)
        .where(Button.clinic_id == clinic_id)
        .scalar_subquery()
    )
    result = db.execute(
        delete(UnassignedSignal).where(
            UnassignedSignal.clinic_id == clinic_id,
            UnassignedSignal.ev1527_code.in_(bound_codes_subquery),
        )
    )
    db.commit()
    return result.rowcount


def get_by_code(db: Session, clinic_id: int, ev1527_code: int) -> UnassignedSignal | None:
    return db.scalar(
        select(UnassignedSignal).where(
            UnassignedSignal.clinic_id == clinic_id, UnassignedSignal.ev1527_code == ev1527_code
        )
    )


def record_sighting(db: Session, clinic_id: int, *, device_pk: int, ev1527_code: int) -> UnassignedSignal:
    """Insert a new unassigned-signal row, or bump last_seen_at/seen_count if one already
    exists. Returns the row so the caller can broadcast it to dashboards after commit.

    A single atomic INSERT .. ON CONFLICT DO UPDATE, not a SELECT followed by an INSERT.
    RF buttons retransmit and patients mash the button, so two presses of the SAME unknown
    code arrive concurrently as a matter of course -- with check-then-insert both requests
    saw no row, both inserted, and the second died on uq_unassigned_clinic_code. That
    surfaced as a 500 on POST /api/v1/calls, i.e. on the patient-call path, roughly twice a
    day in production. The bound-button path below already serialises per room with an
    advisory lock; this path had no such protection.

    seen_count is incremented from the stored column rather than from a value read earlier,
    so concurrent presses each count exactly once.
    """
    now = datetime.now(timezone.utc)
    stmt = (
        pg_insert(UnassignedSignal)
        .values(
            clinic_id=clinic_id,
            device_id=device_pk,
            ev1527_code=ev1527_code,
            first_seen_at=now,
            last_seen_at=now,
            seen_count=1,
        )
        .on_conflict_do_update(
            constraint="uq_unassigned_clinic_code",
            set_={
                "last_seen_at": now,
                "device_id": device_pk,
                "seen_count": UnassignedSignal.__table__.c.seen_count + 1,
            },
        )
        .returning(UnassignedSignal)
    )
    # first_seen_at is deliberately absent from the update set: it records when this code
    # was FIRST heard, which is what tells an admin whether a stray signal is new or
    # long-standing.
    signal = db.execute(stmt).scalar_one()
    return signal


def delete_by_code(db: Session, clinic_id: int, ev1527_code: int) -> None:
    db.execute(
        delete(UnassignedSignal).where(
            UnassignedSignal.clinic_id == clinic_id, UnassignedSignal.ev1527_code == ev1527_code
        )
    )


def delete_by_id(db: Session, clinic_id: int, signal_id: int) -> bool:
    result = db.execute(
        delete(UnassignedSignal).where(
            UnassignedSignal.clinic_id == clinic_id, UnassignedSignal.id == signal_id
        )
    )
    db.commit()
    return result.rowcount > 0


def delete_all_by_clinic(db: Session, clinic_id: int) -> int:
    result = db.execute(
        delete(UnassignedSignal).where(UnassignedSignal.clinic_id == clinic_id)
    )
    db.commit()
    return result.rowcount
