"""Writing live events and delivering their push notifications.

record() runs inside the caller's transaction, so an event exists exactly when the change
it announces does: a rolled-back acknowledgement leaves no "ack" behind, and NOTIFY (which
Postgres only delivers on commit) never tells another process about something that did
not happen.

Push is claimed before it is sent, so the request that created the event and the sweeper
never both send it. A claim that never completes -- the process died mid-send -- is
retried after PUSH_RECLAIM_SECONDS. That can mean a phone buzzes twice for one call;
the alternative is a nurse never hearing about it, which is worse.
"""

import json
import logging
import os
import socket
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select, text, update
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import OutboxEvent

logger = logging.getLogger(__name__)

CHANNEL = "nursecall_events"

# A push the request path has not even claimed after this long is the sweeper's to send.
PUSH_UNCLAIMED_GRACE_SECONDS = 5
# A claim older than this died with its process.
PUSH_RECLAIM_SECONDS = 60
# Past this an alert is history, not news: a buzz ten minutes late helps nobody.
PUSH_GIVE_UP_SECONDS = 600
PUSH_MAX_ATTEMPTS = 5
KEEP_EVENTS_DAYS = 7

_origin: tuple[int, str] | None = None


def origin() -> str:
    """Identifies this process. Recomputed after a fork so two workers never share one."""
    global _origin
    pid = os.getpid()
    if _origin is None or _origin[0] != pid:
        _origin = (pid, f"{socket.gethostname()}:{pid}:{uuid.uuid4().hex[:8]}")
    return _origin[1]


def _json_safe(value: dict) -> dict:
    from app.ws_manager import _json_default

    return json.loads(json.dumps(value, default=_json_default))


def record(
    db: Session, clinic_id: int, message: dict, *, floor: int | None = None, push: dict | None = None
) -> int:
    """Adds an event to the caller's transaction and returns its id. Does not commit."""
    event = OutboxEvent(
        clinic_id=clinic_id,
        message=_json_safe(message),
        floor=floor,
        origin=origin(),
        push=push,
    )
    db.add(event)
    db.flush()
    db.execute(text("SELECT pg_notify(:channel, :payload)"), {"channel": CHANNEL, "payload": str(event.id)})
    return event.id


def _send(clinic_id: int, push: dict) -> None:
    from app.services import push_service

    kind = push.get("kind")
    if kind == "new_call":
        push_service.send_new_call_notifications(
            clinic_id, call_id=push["call_id"], room_number=push["room_number"], floor=push["floor"]
        )
    elif kind == "cancel":
        push_service.send_ack_notifications(clinic_id, push["call_id"])
    else:
        logger.warning("Unknown push kind %r, dropping", kind)


def _mark_done(event_id: int) -> None:
    with SessionLocal() as db:
        db.execute(
            update(OutboxEvent)
            .where(OutboxEvent.id == event_id)
            .values(push_done_at=datetime.now(timezone.utc))
        )
        db.commit()


def deliver_push(event_id: int) -> None:
    """Sends one event's push now, unless someone already claimed it. Never raises:
    it runs after the response, where an exception has nobody to reach."""
    try:
        with SessionLocal() as db:
            row = db.execute(
                update(OutboxEvent)
                .where(
                    OutboxEvent.id == event_id,
                    OutboxEvent.push.is_not(None),
                    OutboxEvent.push_claimed_at.is_(None),
                    OutboxEvent.push_done_at.is_(None),
                )
                .values(
                    push_claimed_at=datetime.now(timezone.utc), push_attempts=OutboxEvent.push_attempts + 1
                )
                .returning(OutboxEvent.clinic_id, OutboxEvent.push)
            ).first()
            db.commit()
        if row is None:
            return
        _send(row.clinic_id, row.push)
        _mark_done(event_id)
    except Exception:
        logger.exception("Push for outbox event %s failed; the sweeper will retry it", event_id)


def sweep_pushes(limit: int = 50) -> int:
    """Sends every push that is due and not in flight. Returns how many it sent.

    Covers events written by processes with nobody to push for them (background jobs),
    and pushes whose process died between commit and send.
    """
    now = datetime.now(timezone.utc)
    with SessionLocal() as db:
        due = (
            select(OutboxEvent.id)
            .where(
                OutboxEvent.push.is_not(None),
                OutboxEvent.push_done_at.is_(None),
                OutboxEvent.push_attempts < PUSH_MAX_ATTEMPTS,
                OutboxEvent.created_at > now - timedelta(seconds=PUSH_GIVE_UP_SECONDS),
                (
                    (OutboxEvent.push_claimed_at.is_(None))
                    & (OutboxEvent.created_at < now - timedelta(seconds=PUSH_UNCLAIMED_GRACE_SECONDS))
                )
                | (OutboxEvent.push_claimed_at < now - timedelta(seconds=PUSH_RECLAIM_SECONDS)),
            )
            .order_by(OutboxEvent.id)
            .limit(limit)
            .with_for_update(skip_locked=True)
        )
        rows = db.execute(
            update(OutboxEvent)
            .where(OutboxEvent.id.in_(due.scalar_subquery()))
            .values(push_claimed_at=now, push_attempts=OutboxEvent.push_attempts + 1)
            .returning(OutboxEvent.id, OutboxEvent.clinic_id, OutboxEvent.push)
        ).all()
        db.commit()

    for row in rows:
        try:
            _send(row.clinic_id, row.push)
            _mark_done(row.id)
        except Exception:
            logger.exception("Swept push for outbox event %s failed", row.id)
    return len(rows)


def prune() -> int:
    with SessionLocal() as db:
        result = db.execute(
            delete(OutboxEvent).where(
                OutboxEvent.created_at < datetime.now(timezone.utc) - timedelta(days=KEEP_EVENTS_DAYS)
            )
        )
        db.commit()
        return result.rowcount


def latest_id() -> int:
    with SessionLocal() as db:
        return db.scalar(select(OutboxEvent.id).order_by(OutboxEvent.id.desc()).limit(1)) or 0


def foreign_since(after_id: int, *, max_age_seconds: int = 60) -> list[OutboxEvent]:
    """Events other processes wrote after `after_id`, for catching up after the
    listener reconnects. Bounded in age: a board that was offline for an hour reloads
    from the API anyway, and replaying an hour of events would only flash it."""
    cutoff = datetime.now(timezone.utc) - timedelta(seconds=max_age_seconds)
    with SessionLocal() as db:
        rows = db.scalars(
            select(OutboxEvent)
            .where(OutboxEvent.id > after_id, OutboxEvent.created_at > cutoff, OutboxEvent.origin != origin())
            .order_by(OutboxEvent.id)
        ).all()
        db.expunge_all()
        return list(rows)


def get(event_id: int) -> OutboxEvent | None:
    with SessionLocal() as db:
        event = db.get(OutboxEvent, event_id)
        if event is not None:
            db.expunge(event)
        return event
