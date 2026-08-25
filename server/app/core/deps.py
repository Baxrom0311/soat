"""FastAPI dependencies: DB session, current-user extraction, role guards."""

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session
import jwt

from app.core import billing
from app.core.security import decode_token
from app.database import SessionLocal
from app.enums import StaffRole
from app.repositories import clinic_repo

bearer_scheme = HTTPBearer(auto_error=False)


def get_db():
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()


class CurrentUser:
    def __init__(self, staff_id: int, clinic_id: int | None, role: str, email: str, name: str):
        self.staff_id = staff_id
        self.clinic_id = clinic_id
        self.role = role
        self.email = email
        self.name = name


def _user_from_payload(payload: dict) -> CurrentUser:
    try:
        role = StaffRole(payload["role"]).value
        staff_id = int(payload["sub"])
    except (KeyError, ValueError):
        raise HTTPException(status_code=401, detail="invalid token")
    return CurrentUser(
        staff_id=staff_id,
        clinic_id=payload.get("clinic_id"),  # null for superadmin tokens
        role=role,
        email=payload.get("email", ""),
        name=payload.get("name", ""),
    )


def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> CurrentUser:
    if creds is None or not creds.credentials:
        raise HTTPException(status_code=401, detail="Missing bearer token")
    try:
        payload = decode_token(creds.credentials)
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return _user_from_payload(payload)


def get_clinic_user(
    user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db)
) -> CurrentUser:
    """Guard for clinic-scoped routes: rejects superadmin tokens (no clinic to act on)
    and enforces subscription suspension with a fresh DB read per request, so a
    superadmin flipping the switch takes effect on the clinic's very next request."""
    if user.clinic_id is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Clinic account required")
    clinic = clinic_repo.get(db, user.clinic_id)
    if clinic is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Clinic not found")
    # Blocked == manually suspended OR payment overdue (paid_until passed). Same 402 +
    # detail as before so the dashboard's existing suspended-screen handling still fires.
    # Device ingestion/heartbeat never reach here (device-key auth), so patient calls
    # keep flowing regardless.
    if billing.is_blocked(clinic):
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED, detail="subscription_suspended"
        )
    return user


def require_admin(user: CurrentUser = Depends(get_clinic_user)) -> CurrentUser:
    if user.role != StaffRole.ADMIN.value:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin role required")
    return user


def require_superadmin(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    if user.role != StaffRole.SUPERADMIN.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Superadmin role required"
        )
    return user


def get_current_user_ws(token: str | None) -> CurrentUser | None:
    """Same as get_current_user but for the WS handshake, where the token arrives as a query param."""
    if not token:
        return None
    try:
        payload = decode_token(token)
    except jwt.PyJWTError:
        return None
    return _user_from_payload(payload)
