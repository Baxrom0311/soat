from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser, get_current_user, get_db
from app.schemas.auth import ChangePasswordIn, LoginIn, LoginOut
from app.services import auth_service

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


@router.post("/login", response_model=LoginOut)
def login(body: LoginIn, request: Request, db: Session = Depends(get_db)):
    client_ip = request.client.host if request.client else "unknown"
    return auth_service.login(db, email=body.email, password=body.password, client_ip=client_ip)


@router.post("/refresh", response_model=LoginOut)
def refresh(user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db)):
    return auth_service.refresh(db, user=user)


@router.post("/change-password", status_code=204)
def change_password(
    body: ChangePasswordIn,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    auth_service.change_own_password(
        db, staff_id=user.staff_id, current_password=body.current_password, new_password=body.new_password
    )
