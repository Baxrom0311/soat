from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser, get_clinic_user_ungated, get_db
from app.schemas.push_token import PushTokenIn, PushTokenOut
from app.services import push_token_service

# Alerting path: never billing-gated. If a blocked clinic could not register a
# push token, a nurse installing the app on a new phone would silently stop
# receiving call notifications.
router = APIRouter(prefix="/api/v1/push-tokens", tags=["push-tokens"])


@router.post("", response_model=PushTokenOut)
def register_push_token(
    body: PushTokenIn,
    user: CurrentUser = Depends(get_clinic_user_ungated),
    db: Session = Depends(get_db),
):
    push_token_service.register_token(
        db, clinic_id=user.clinic_id, staff_id=user.staff_id, token=body.expo_push_token
    )
    return PushTokenOut(ok=True)


@router.delete("", response_model=PushTokenOut)
def unregister_push_token(
    body: PushTokenIn,
    user: CurrentUser = Depends(get_clinic_user_ungated),
    db: Session = Depends(get_db),
):
    push_token_service.unregister_token(
        db, clinic_id=user.clinic_id, staff_id=user.staff_id, token=body.expo_push_token
    )
    return PushTokenOut(ok=True)
