"""Password/device-key hashing and JWT create/decode primitives.

No DB access and no FastAPI dependencies live here — this module only knows
about cryptographic primitives and token encoding.
"""

import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from app.core.config import (
    DEVICE_KEY_SECRET,
    JWT_ALGORITHM,
    JWT_EXPIRE_MINUTES,
    JWT_SECRET,
    JWT_SECRET_OLD,
)


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode(), hashed.encode())
    except ValueError:
        return False


# ---------------------------------------------------------------- device keys
#
# Device API keys are NOT passwords and must not be hashed like them.
#
# A password is something a person chose, so an attacker who steals the database
# can guess at it -- and bcrypt exists to make each of those guesses expensive. A
# device key is `secrets.token_urlsafe(32)`: 256 bits of randomness, which cannot
# be guessed at any hash speed. bcrypt's slowness therefore buys nothing here,
# and it is not free: measured on the production box, cost=12 takes 648ms, which
# is 94% of the time a patient's button press spends on the server. Everything
# else -- Python, FastAPI, SQLAlchemy, three Postgres queries -- comes to 40ms.
#
# So device keys use HMAC-SHA256 under a server-held secret. Same property that
# mattered (a stolen database alone is not enough; the attacker also needs the
# secret), at 14 microseconds instead of 648 milliseconds.
#
# Passwords keep bcrypt. That is where it belongs.

_HMAC_PREFIX = "hmac-sha256$"


def hash_device_key(plain: str) -> str:
    """HMAC of the key under DEVICE_KEY_SECRET, or bcrypt when none is configured.

    Falling back rather than failing is deliberate: a server whose secret is
    missing must keep authenticating devices the way it did yesterday. Patient
    calls do not stop because of an unset environment variable.
    """
    if not DEVICE_KEY_SECRET:
        return hash_password(plain)
    digest = hmac.new(DEVICE_KEY_SECRET.encode(), plain.encode(), hashlib.sha256).hexdigest()
    return _HMAC_PREFIX + digest


def verify_device_key(plain: str, stored: str) -> tuple[bool, bool]:
    """Returns (ok, should_rehash).

    Accepts both formats, because the devices in the field were registered under
    bcrypt and there is no way to re-derive their hashes: the plaintext exists
    only on the ESP32 and in the request currently being authenticated. So the
    upgrade happens exactly there -- a device proves its key, and that same call
    rewrites the stored hash. Nothing is re-issued and no device loses access;
    the fleet migrates itself on its next heartbeat.
    """
    if stored.startswith(_HMAC_PREFIX):
        expected = stored[len(_HMAC_PREFIX) :]
        actual = hmac.new(DEVICE_KEY_SECRET.encode(), plain.encode(), hashlib.sha256).hexdigest()
        # compare_digest, not ==: a byte-by-byte comparison that returns early
        # leaks the length of the matching prefix through timing.
        return hmac.compare_digest(expected, actual), False
    # Legacy bcrypt. Verifying costs the full 648ms, which is precisely why the
    # second element of the tuple exists.
    ok = verify_password(plain, stored)
    return ok, ok and bool(DEVICE_KEY_SECRET)


# Kept for call sites that still mean "hash an arbitrary secret with bcrypt".
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
    """Raises jwt.PyJWTError on invalid/expired tokens; callers decide how to surface it.

    Tries the previous signing key too, when one is configured. That is what lets the
    signing key be replaced without logging out a ward mid-shift: tokens issued before
    the change keep verifying until they expire, and nothing new is ever signed with the
    old key. Signature failure is the ONLY reason to fall through -- an expired or
    malformed token must stay rejected, not get a second opinion.
    """
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.InvalidSignatureError:
        if not JWT_SECRET_OLD:
            raise
        return jwt.decode(token, JWT_SECRET_OLD, algorithms=[JWT_ALGORITHM])
