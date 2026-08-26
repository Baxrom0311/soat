"""Call lifecycle business logic: ingestion from ESP32 devices, listing, acknowledgment.

create_call_from_device and acknowledge_call both push a realtime event to the
clinic's dashboard websocket connections after committing the DB change.
create_call_from_device additionally schedules an Expo push notification (to every
mobile device registered for the clinic) as a BackgroundTask, on top of -- not instead
of -- the websocket broadcast. Push delivery is a side effect: it must never block or
fail the response to the calling ESP32 device.

Ingestion is deduplicated per room under a Postgres advisory lock: a press while the
room already has an active call returns that existing call (deduplicated=true) with no
new row, push, or broadcast. A client-supplied press_id additionally makes firmware
retries idempotent regardless of how much later they land (lost-response + late retry
must not create a phantom call). There is deliberately no further time-window fallback
once the active call is gone (acknowledged) -- a new press at that point is a genuinely
new call and must always alert staff, even if it happens moments after the last one.

The two async entrypoints exist only to await the websocket broadcast; every blocking
piece (bcrypt device-key verification ~100-300ms, all SQLAlchemy work) runs in the
threadpool via run_in_threadpool so a button press can never stall the event loop --
and with it every other request and websocket -- for the duration of a bcrypt check.
"""

import asyncio
from datetime import datetime, timezone

from fastapi import BackgroundTasks, HTTPException
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.orm import Session

from app.core.config import CALL_INGEST_RATE_LIMIT_MAX, CALL_INGEST_RATE_LIMIT_WINDOW_SECONDS
from app.core.rate_limit import SlidingWindowLimiter
from app.repositories import button_repo, call_repo, device_repo, staff_floor_repo, unassigned_repo
from app.schemas.call import ActiveCallOut, AckOut, CallCreateOut, HistoryCallOut
from app.services import push_service
from app.services.device_service import authenticate_device, check_device_auth_rate
from app.ws_manager import manager

# Keyed by clinic_id (only known once the posting device's key has authenticated it),
# not by IP: devices behind the same clinic WiFi already share an IP, and the point
# is to cap one TENANT's total ingestion rate, not one network address.
_ingest_limiter = SlidingWindowLimiter(
    max_events=CALL_INGEST_RATE_LIMIT_MAX, window_seconds=CALL_INGEST_RATE_LIMIT_WINDOW_SECONDS
)


def _ingest_sync(
    db: Session,
    *,
    device_id: str,
    plaintext_key: str | None,
    ev1527_code: int,
    press_id: str | None,
    client_ip: str = "unknown",
) -> tuple[CallCreateOut | None, int, dict | None, dict | None]:
    """All blocking work for one ingestion. Returns (out, clinic_id, ws_event, push_args);
    out None means unknown code -> the async wrapper broadcasts ws_event then raises 404."""
    # Before authenticate_device on purpose: verifying the key is a ~230ms bcrypt, and
    # this endpoint is unauthenticated, so an IP-keyed ceiling has to come first or a
    # wrong-key flood costs us CPU we never budgeted. The per-clinic limiter below can
    # only run after the key identifies a clinic.
    check_device_auth_rate(client_ip)
    device = authenticate_device(db, device_id=device_id, plaintext_key=plaintext_key)

    if not _ingest_limiter.check(str(device.clinic_id)):
        # Checked before touch_last_seen/any write on purpose: a rejected request
        # does no DB work at all. 429, not a silent drop -- the ESP32 firmware
        # already retries a 429 with backoff via its offline queue, so a real press
        # is never lost, just delayed.
        raise HTTPException(status_code=429, detail="Too many calls from this clinic, try again shortly")

    device_repo.touch_last_seen(db, device)

    match = button_repo.get_by_code(db, device.clinic_id, ev1527_code)
    if match is None:
        # Not bound to a room yet -> log/refresh it in unassigned_signals for the admin to claim.
        signal = unassigned_repo.record_sighting(
            db, device.clinic_id, device_pk=device.id, ev1527_code=ev1527_code
        )
        db.commit()
        db.refresh(signal)
        event = {
            "type": "unassigned_signal",
            "signal": {
                "id": signal.id,
                "ev1527_code": signal.ev1527_code,
                "device_id": device.device_id,
                "first_seen_at": signal.first_seen_at.isoformat(),
                "last_seen_at": signal.last_seen_at.isoformat(),
                "seen_count": signal.seen_count,
            },
        }
        return None, device.clinic_id, event, None

    button, room = match

    # RF buttons retransmit and patients mash the button, so concurrent duplicate POSTs
    # are the norm. The advisory lock serializes ingestion per room; it is released when
    # one of the commits below ends the transaction.
    call_repo.lock_room(db, device.clinic_id, room.id)

    # Firmware retry of a press whose response was lost: same press_id -> same call,
    # even if it lands long after the time-window dedupe below would have expired.
    existing = None
    if press_id:
        existing = call_repo.get_by_press_id(db, device.clinic_id, press_id)
    if existing is None:
        # The only real dedupe case left after press_id: a call is already active for
        # this room (RF retransmit / mashed button while nobody has acknowledged yet).
        # There used to be a further time-window fallback onto the room's *latest*
        # call regardless of status -- but get_active_by_room above already returns
        # any still-active call, so that fallback only ever matched an *acknowledged*
        # one, silently swallowing a genuine new press with no call, no push, no
        # broadcast. Removed: a spurious extra call is far safer than a missed one.
        existing = call_repo.get_active_by_room(db, device.clinic_id, room.id)
    if existing is not None:
        # Fold the repeat press into the existing call: no new row, no push, no broadcast.
        # Room/floor come from the existing call's OWN room, not the just-resolved
        # `room` above: a press_id match can be an old call whose button has since
        # been rebound to a different room, and the response must describe the call
        # actually being referenced, not wherever the button currently points.
        out = CallCreateOut(
            call_id=existing.id,
            room_number=existing.room.room_number,
            floor=existing.room.floor,
            created_at=existing.created_at,
            deduplicated=True,
        )
        db.commit()  # persists the last_seen_at bump and releases the room lock
        return out, device.clinic_id, None, None

    call = call_repo.create(
        db, device.clinic_id, room_id=room.id, device_id=device.id, press_id=press_id
    )
    db.commit()
    db.refresh(call)

    out = CallCreateOut(
        call_id=call.id, room_number=room.room_number, floor=room.floor, created_at=call.created_at
    )
    event = {
        "type": "new_call",
        "call": {
            "call_id": call.id,
            "room_number": room.room_number,
            "floor": room.floor,
            "created_at": call.created_at,
            "status": call.status,
        },
    }
    push_args = {"call_id": call.id, "room_number": room.room_number, "floor": room.floor}
    return out, device.clinic_id, event, push_args


async def create_call_from_device(
    db: Session,
    *,
    device_id: str,
    plaintext_key: str | None,
    ev1527_code: int,
    press_id: str | None = None,
    background_tasks: BackgroundTasks | None = None,
    client_ip: str = "unknown",
) -> CallCreateOut:
    out, clinic_id, event, push_args = await run_in_threadpool(
        _ingest_sync,
        db,
        device_id=device_id,
        plaintext_key=plaintext_key,
        ev1527_code=ev1527_code,
        press_id=press_id,
        client_ip=client_ip,
    )
    if event is not None:
        # Fire-and-forget: a slow/stuck dashboard socket must never delay the
        # HTTP response to the ESP32 device that's waiting on this call to post.
        # floor=None for unassigned_signal events -- those have no room/floor yet
        # and stay clinic-wide; new_call carries its room's floor so per-connection
        # floor filtering (registered at ws connect time) applies to it.
        floor = event["call"]["floor"] if event["type"] == "new_call" else None
        asyncio.create_task(manager.broadcast(clinic_id, event, floor=floor))
    if out is None:
        raise HTTPException(status_code=404, detail="Unknown code")
    if push_args is not None and background_tasks is not None:
        background_tasks.add_task(
            push_service.send_new_call_notifications, clinic_id, **push_args
        )
    return out


def list_active_calls(db: Session, clinic_id: int, *, staff_id: int, role: str) -> list[ActiveCallOut]:
    rows = call_repo.list_active_with_room_by_clinic(db, clinic_id)
    visible_floors = staff_floor_repo.get_visible_floors(db, staff_id, role)
    if visible_floors is not None:
        rows = [(call, room) for call, room in rows if room.floor in visible_floors]
    return [
        ActiveCallOut(
            call_id=call.id, room_number=room.room_number, floor=room.floor, created_at=call.created_at, status=call.status
        )
        for call, room in rows
    ]


def call_history(db: Session, clinic_id: int, *, limit: int, staff_id: int, role: str) -> list[HistoryCallOut]:
    visible_floors = staff_floor_repo.get_visible_floors(db, staff_id, role)
    rows = call_repo.list_history_with_room_device_by_clinic(
        db, clinic_id, limit=limit, floors=visible_floors
    )
    return [
        HistoryCallOut(
            call_id=call.id,
            room_number=room.room_number,
            floor=room.floor,
            status=call.status,
            device_id=device.device_id,
            created_at=call.created_at,
            acknowledged_at=call.acknowledged_at,
            acknowledged_by=call.acknowledged_by,
        )
        for call, room, device in rows
    ]


def _ack_sync(db: Session, clinic_id: int, call_id: int, *, acknowledged_by: str) -> AckOut:
    call = call_repo.get(db, clinic_id, call_id)
    if call is None:
        raise HTTPException(status_code=404, detail="Call not found")
    if not call_repo.acknowledge_if_active(db, clinic_id, call_id, acknowledged_by=acknowledged_by):
        db.rollback()
        raise HTTPException(status_code=409, detail="Call already acknowledged")
    db.commit()
    db.refresh(call)
    return AckOut(call_id=call.id, status=call.status, acknowledged_at=call.acknowledged_at)


async def acknowledge_call(db: Session, clinic_id: int, call_id: int, *, acknowledged_by: str) -> AckOut:
    out = await run_in_threadpool(_ack_sync, db, clinic_id, call_id, acknowledged_by=acknowledged_by)
    asyncio.create_task(manager.broadcast(clinic_id, {"type": "ack", "call_id": out.call_id}))
    return out
