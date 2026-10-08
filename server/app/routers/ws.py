import asyncio
from contextlib import suppress

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from starlette.concurrency import run_in_threadpool

from app.core.deps import get_current_user_ws
from app.database import SessionLocal
from app.repositories import clinic_repo, staff_floor_repo
from app.ws_manager import manager

router = APIRouter()


def _token_from_subprotocol(websocket: WebSocket) -> str | None:
    """Reads the JWT out of `Sec-WebSocket-Protocol: bearer, <token>`.

    Preferred over `?token=` because a query string is written verbatim into uvicorn's
    access log and nginx's -- a production journal was found holding 131 live session
    tokens that way. Subprotocol values never appear in either access log.
    """
    header = websocket.headers.get("sec-websocket-protocol")
    if not header:
        return None
    parts = [p.strip() for p in header.split(",")]
    if len(parts) >= 2 and parts[0].lower() == "bearer" and parts[1]:
        return parts[1]
    return None


@router.websocket("/ws/calls")
async def ws_calls(websocket: WebSocket, token: str | None = None):
    # `?token=` is a DEPRECATED fallback, kept only so an already-loaded dashboard tab
    # (serving a cached build from before this change) keeps working. It is redacted in
    # the logs by app.core.log_redaction. New clients must use the subprotocol.
    subprotocol_token = _token_from_subprotocol(websocket)

    # NOT billing-gated, matching GET /api/v1/calls/active (get_clinic_user_ungated):
    # this socket is how a live call reaches the board a nurse is watching, so gating it
    # would mean an unpaid invoice can stop a patient's call from being seen. Only
    # management is withheld from a blocked clinic. The two must agree -- gating one and
    # not the other would leave the board silently stale instead of visibly blocked.
    # 4402 is therefore no longer sent; anything unauthorized gets 4401.
    #
    # The session is opened before accept() so the token can be revalidated against the
    # staff row: a deleted account must not be able to hold an open call stream for the
    # remaining lifetime of its (year-long) token.
    credential = subprotocol_token or token

    def read_authority():
        with SessionLocal() as db:
            user = get_current_user_ws(credential, db)
            if user is None or user.clinic_id is None or clinic_repo.get(db, user.clinic_id) is None:
                return None
            floors = staff_floor_repo.get_visible_floors(db, user.staff_id, user.role) or []
            return user, floors

    initial = await run_in_threadpool(read_authority)

    # Accept up front: a close() before accept() is downgraded to HTTP 403 and the
    # custom close code never reaches the browser. Accept-then-close delivers 4401.
    # When the client offered a subprotocol we MUST echo one back or the browser fails
    # the connection itself.
    await websocket.accept(subprotocol="bearer" if subprotocol_token else None)

    if initial is None:
        await websocket.close(code=4401)
        return
    user, floors = initial

    async def validate():
        current = await run_in_threadpool(read_authority)
        if current is None or current[0].clinic_id != user.clinic_id:
            return None
        return current[0].role, current[1]

    manager.register(
        websocket, user.clinic_id, role=user.role, floors=floors, validate=validate, staff_id=user.staff_id
    )
    try:
        while True:
            with suppress(asyncio.TimeoutError):
                await asyncio.wait_for(websocket.receive_text(), timeout=30)
            if not await manager.revalidate(websocket, user.clinic_id):
                return
    except (WebSocketDisconnect, RuntimeError):
        pass
    finally:
        manager.disconnect(websocket, user.clinic_id)
