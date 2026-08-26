from fastapi import APIRouter, BackgroundTasks, Depends, Header, Query, Request
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser, get_clinic_user, get_clinic_user_ungated, get_db
from app.schemas.call import (
    AckIn,
    AckOut,
    ActiveCallOut,
    CallCreate,
    CallCreateOut,
    HistoryCallOut,
)
from app.services import call_service

router = APIRouter(prefix="/api/v1/calls", tags=["calls"])


@router.post("", response_model=CallCreateOut, status_code=201)
async def create_call(
    body: CallCreate,
    background_tasks: BackgroundTasks,
    request: Request,
    x_device_key: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    # The IP feeds the pre-bcrypt rate limit in device_service; the per-clinic limit
    # further down can only apply once the key has been verified.
    client_ip = request.client.host if request.client else "unknown"
    return await call_service.create_call_from_device(
        db,
        device_id=body.device_id,
        plaintext_key=x_device_key,
        client_ip=client_ip,
        ev1527_code=body.ev1527_code,
        press_id=body.press_id,
        background_tasks=background_tasks,
    )


# Alerting path: never billing-gated. A blocked clinic's nurses must still see and
# acknowledge live calls -- only management (history/reports/CRUD below) is withheld.
@router.get("/active", response_model=list[ActiveCallOut])
def list_active_calls(user: CurrentUser = Depends(get_clinic_user_ungated), db: Session = Depends(get_db)):
    return call_service.list_active_calls(db, user.clinic_id, staff_id=user.staff_id, role=user.role)


@router.get("/history", response_model=list[HistoryCallOut])
def call_history(
    limit: int = Query(default=50, ge=1, le=500),
    user: CurrentUser = Depends(get_clinic_user),
    db: Session = Depends(get_db),
):
    return call_service.call_history(db, user.clinic_id, limit=limit, staff_id=user.staff_id, role=user.role)


@router.post("/{call_id}/ack", response_model=AckOut)
async def acknowledge_call(
    call_id: int,
    body: AckIn,
    user: CurrentUser = Depends(get_clinic_user_ungated),  # alerting path -- see /active
    db: Session = Depends(get_db),
):
    acknowledged_by = body.acknowledged_by or user.name or user.email
    return await call_service.acknowledge_call(db, user.clinic_id, call_id, acknowledged_by=acknowledged_by)
