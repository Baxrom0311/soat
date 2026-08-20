"""Password/device-key hashing and JWT create/decode primitives.

No DB access and no FastAPI dependencies live here — this module only knows
about cryptographic primitives and token encoding.
"""

import secrets
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from app.core.config import JWT_ALGORITHM, JWT_EXPIRE_MINUTES, JWT_SECRET


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode(), hashed.encode())
    except ValueError:
        return False


# device API keys use the same bcrypt primitive as passwords; aliased for readability at call sites
hash_secret = hash_password
verify_secret = verify_password


def generate_device_key() -> str:
    return "dk_" + secrets.token_urlsafe(32)


def create_access_token(*, staff_id: int, clinic_id: int | None, role: str, email: str, name: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(staff_id),
        "clinic_id": clinic_id,
        "role": role,
        "email": email,
        "name": name,
        "iat": now,
        "exp": now + timedelta(minutes=JWT_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    """Raises jwt.PyJWTError on invalid/expired tokens; callers decide how to surface it."""
    return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
