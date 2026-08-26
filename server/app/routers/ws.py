from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core.deps import get_current_user_ws
from app.database import SessionLocal
from app.repositories import clinic_repo, staff_floor_repo
from app.ws_manager import manager

router = APIRouter()


@router.websocket("/ws/calls")
async def ws_calls(websocket: WebSocket, token: str | None = None):
    user = get_current_user_ws(token)
    # Accept up front: a close() before accept() is downgraded to HTTP 403 and the
    # custom close code never reaches the browser. Accept-then-close delivers 4401/4402.
    await websocket.accept()

    if user is None or user.clinic_id is None:
        # superadmin tokens (clinic_id null) have no clinic stream to join
        await websocket.close(code=4401)  # custom close code: unauthorized
        return

    # NOT billing-gated, matching GET /api/v1/calls/active (get_clinic_user_ungated):
    # this socket is how a live call reaches the board a nurse is watching, so gating it
    # would mean an unpaid invoice can stop a patient's call from being seen. Only
    # management is withheld from a blocked clinic. The two must agree -- gating one and
    # not the other would leave the board silently stale instead of visibly blocked.
    # 4402 is therefore no longer sent; an unknown clinic still gets 4401.
    db = SessionLocal()
    try:
        clinic = clinic_repo.get(db, user.clinic_id)
        floors = staff_floor_repo.get_visible_floors(db, user.staff_id, user.role) or []
    finally:
        db.close()
    if clinic is None:
        await websocket.close(code=4401)
        return

    manager.register(websocket, user.clinic_id, role=user.role, floors=floors)
    try:
        while True:
            # Dashboard doesn't send anything meaningful; just keep the socket alive.
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket, user.clinic_id)
