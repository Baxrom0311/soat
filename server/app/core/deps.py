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


def _resolve_clinic(user: CurrentUser, db: Session):
    """Shared by the gated and ungated variants: rejects superadmin tokens (no clinic to
    act on) and reads the clinic fresh per request, so a superadmin flipping a switch
    takes effect on the clinic's very next request."""
    if user.clinic_id is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Clinic account required")
    clinic = clinic_repo.get(db, user.clinic_id)
    if clinic is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Clinic not found")
    return clinic


def get_clinic_user_ungated(
    user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db)
) -> CurrentUser:
    """Clinic member, WITHOUT the billing gate. Deliberately exempt, for two kinds of
    route only:

      1. Patient-safety alerting -- listing active calls, acknowledging one, and
         registering the push token that delivers them. An unpaid invoice must never be
         able to turn into a patient pressing a button and nobody coming; the money
         pressure belongs on clinic MANAGEMENT (see get_clinic_user), not on the alarm
         path. Note that call ingestion and heartbeat never reach any of these
         dependencies at all -- they authenticate with a device key.
      2. Reading the clinic's own billing state, so a blocked clinic can still see WHY
         it is blocked and how to pay. Gating that would leave the clinic locked out of
         the very screen that gets it unlocked.

    Everything else must use the gated variant. New routes get the gated one by default
    and only move here with a reason that fits one of the two cases above.
    """
    _resolve_clinic(user, db)
    return user


def get_clinic_user(
    user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db)
) -> CurrentUser:
    """Clinic member WITH the billing gate -- the default for clinic-scoped routes.

    Blocked == manually suspended OR payment overdue past the grace window. Returns the
    same 402 + detail as before so the dashboard's existing suspended-screen handling
    still fires.
    """
    clinic = _resolve_clinic(user, db)
    if billing.is_blocked(clinic):
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED, detail="subscription_suspended"
        )
    return user


def _require_admin_role(user: CurrentUser) -> CurrentUser:
    if user.role != StaffRole.ADMIN.value:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin role required")
    return user


def require_admin(user: CurrentUser = Depends(get_clinic_user)) -> CurrentUser:
    return _require_admin_role(user)


def require_admin_ungated(user: CurrentUser = Depends(get_clinic_user_ungated)) -> CurrentUser:
    """Clinic admin without the billing gate -- only for the clinic's own billing/payment
    screen, which has to stay reachable precisely when the clinic is blocked."""
    return _require_admin_role(user)


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
