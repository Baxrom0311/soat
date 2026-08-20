from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core import billing
from app.core.deps import get_current_user_ws
from app.database import SessionLocal
from app.repositories import clinic_repo
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

    # Same billing gate as the REST reads (get_clinic_user): a suspended/overdue clinic
    # doesn't get a live board either. Device ingestion is unaffected — it never opens
    # this socket. 4402 mirrors the REST 402 so the dashboard shows the suspended screen.
    db = SessionLocal()
    try:
        clinic = clinic_repo.get(db, user.clinic_id)
        blocked = clinic is None or billing.is_blocked(clinic)
    finally:
        db.close()
    if blocked:
        await websocket.close(code=4402)  # custom close code: subscription blocked
        return

    manager.register(websocket, user.clinic_id)
    try:
        while True:
            # Dashboard doesn't send anything meaningful; just keep the socket alive.
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket, user.clinic_id)
