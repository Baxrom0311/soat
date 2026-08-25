"""Login business logic. Self-serve registration is gone: clinics and their admin
accounts are provisioned by the superadmin via /api/v1/admin."""

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser
from app.core.rate_limit import SlidingWindowLimiter
from app.core.security import create_access_token, hash_password, verify_password
from app.enums import SubscriptionStatus
from app.repositories import clinic_repo, staff_repo
from app.schemas.auth import LoginOut

# Verified against a real bcrypt hash even when the email is unknown, so response
# timing can't be used to enumerate which emails have accounts.
_DUMMY_HASH = hash_password("timing-equalizer-not-a-real-password")

# Brute-force protection for login. Keyed by ip+email so one attacker can't lock a
# victim out from a single address.
LOGIN_MAX_ATTEMPTS = 5
LOGIN_WINDOW_SECONDS = 60
_login_limiter = SlidingWindowLimiter(max_events=LOGIN_MAX_ATTEMPTS, window_seconds=LOGIN_WINDOW_SECONDS)


def _check_login_rate(client_ip: str, email: str) -> None:
    key = f"{client_ip}:{email.lower()}"
    if not _login_limiter.check(key):
        raise HTTPException(status_code=429, detail="Too many login attempts, try again later")


def login(db: Session, *, email: str, password: str, client_ip: str = "unknown") -> LoginOut:
    _check_login_rate(client_ip, email)

    staff = staff_repo.get_by_email(db, email)
    password_ok = verify_password(password, staff.password_hash if staff else _DUMMY_HASH)
    if staff is None or not password_ok:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    # Suspended clinics can't log in at all; superadmin (clinic_id NULL) is never blocked.
    if staff.clinic_id is not None:
        clinic = clinic_repo.get(db, staff.clinic_id)
        if clinic is not None and clinic.subscription_status == SubscriptionStatus.SUSPENDED:
            raise HTTPException(status_code=403, detail="subscription_suspended")

    token = create_access_token(
        staff_id=staff.id, clinic_id=staff.clinic_id, role=staff.role.value, email=staff.email, name=staff.name
    )
    return LoginOut(access_token=token, role=staff.role, name=staff.name, clinic_id=staff.clinic_id)


def refresh(db: Session, *, user: CurrentUser) -> LoginOut:
    """Reissues a fresh-expiry token for an already-authenticated user. Called
    periodically by the mobile app so a nurse's session (and the copy it relays
    to her paired watch over the Wearable Data Layer) never silently expires as
    long as she opens the phone app at least once within JWT_EXPIRE_MINUTES."""
    if user.clinic_id is not None:
        clinic = clinic_repo.get(db, user.clinic_id)
        if clinic is None or clinic.subscription_status == SubscriptionStatus.SUSPENDED:
            raise HTTPException(status_code=403, detail="subscription_suspended")

    token = create_access_token(
        staff_id=user.staff_id, clinic_id=user.clinic_id, role=user.role, email=user.email, name=user.name
    )
    return LoginOut(access_token=token, role=user.role, name=user.name, clinic_id=user.clinic_id)


def change_own_password(db: Session, *, staff_id: int, current_password: str, new_password: str) -> None:
    staff = staff_repo.get_by_id(db, staff_id)
    if staff is None or not verify_password(current_password, staff.password_hash):
        raise HTTPException(status_code=401, detail="Current password is incorrect")
    if len(new_password) < 8:
        raise HTTPException(status_code=422, detail="Password must be at least 8 characters")
    staff.password_hash = hash_password(new_password)
    db.commit()
