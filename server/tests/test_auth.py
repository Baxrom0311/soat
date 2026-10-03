"""Tokens: who they let in, for how long, and how the signing key gets replaced.

The rotation tests exist because of a real incident. The production .env -- signing key
and database password -- was committed to git on 2026-09-08 and both were still the live
values when it was found. Replacing the key naively logs out every nurse in every clinic
at whatever moment the service restarts, which on a ward is not an acceptable way to fix
a security problem. So the server accepts the previous key for verification while signing
only with the new one, and these tests are what keep that property from being tidied away.
"""

import importlib

import jwt
import pytest

from app.core import config, security


def _reload_with(monkeypatch, **env):
    """Re-import config and security with different environment values.

    Both read their settings at import time, which is right for a server process and
    inconvenient for a test; reloading is the honest way to exercise what a restart
    with a different .env would actually do.
    """
    for key, value in env.items():
        monkeypatch.setenv(key, value)
    importlib.reload(config)
    importlib.reload(security)
    return security


@pytest.fixture(autouse=True)
def restore_modules():
    """Leave the modules exactly as the rest of the suite expects them."""
    yield
    importlib.reload(config)
    importlib.reload(security)


# ------------------------------------------------------------------ the basics


def test_a_token_carries_the_clinic_and_role_the_routes_rely_on(make_clinic):
    c = make_clinic()
    token = security.create_access_token(
        staff_id=c["nurse"].id,
        clinic_id=c["clinic"].id,
        role="nurse",
        email=c["nurse"].email,
        name=c["nurse"].name,
    )
    claims = security.decode_token(token)
    assert claims["clinic_id"] == c["clinic"].id
    assert claims["role"] == "nurse"
    assert claims["sub"] == str(c["nurse"].id)


def test_a_wrong_password_is_rejected(client, make_clinic):
    c = make_clinic()
    res = client.post(
        "/api/v1/auth/login",
        json={"email": c["nurse"].email, "password": "noto'g'ri"},
    )
    assert res.status_code == 401


def test_a_request_without_a_token_is_rejected(client):
    assert client.get("/api/v1/calls/active").status_code in (401, 403)


def test_a_token_signed_with_the_wrong_key_is_rejected(monkeypatch):
    forged = jwt.encode({"sub": "1", "clinic_id": 1, "role": "admin"}, "boshqa-kalit", algorithm="HS256")
    with pytest.raises(jwt.PyJWTError):
        security.decode_token(forged)


# --------------------------------------------------------------- key rotation


def test_tokens_from_the_previous_key_keep_working_during_rotation(monkeypatch):
    old = _reload_with(monkeypatch, JWT_SECRET="eski-kalit-0123456789abcdef", JWT_SECRET_OLD="")
    token = old.create_access_token(staff_id=1, clinic_id=1, role="nurse", email="a@b.uz", name="A")

    rotated = _reload_with(
        monkeypatch,
        JWT_SECRET="yangi-kalit-0123456789abcdef",
        JWT_SECRET_OLD="eski-kalit-0123456789abcdef",
    )
    assert rotated.decode_token(token)["sub"] == "1", "kalit almashtirilganda hamshira tizimdan chiqib ketdi"


def test_new_tokens_are_signed_with_the_new_key_only(monkeypatch):
    rotated = _reload_with(
        monkeypatch,
        JWT_SECRET="yangi-kalit-0123456789abcdef",
        JWT_SECRET_OLD="eski-kalit-0123456789abcdef",
    )
    token = rotated.create_access_token(staff_id=2, clinic_id=1, role="nurse", email="a@b.uz", name="A")
    # Whoever holds the leaked old key must not be able to read, let alone forge, this.
    with pytest.raises(jwt.PyJWTError):
        jwt.decode(token, "eski-kalit-0123456789abcdef", algorithms=["HS256"])
    assert jwt.decode(token, "yangi-kalit-0123456789abcdef", algorithms=["HS256"])["sub"] == "2"


def test_clearing_the_old_key_ends_the_rotation_window(monkeypatch):
    """The point of rotating: eventually the leaked key stops working entirely."""
    old = _reload_with(monkeypatch, JWT_SECRET="eski-kalit-0123456789abcdef", JWT_SECRET_OLD="")
    token = old.create_access_token(staff_id=1, clinic_id=1, role="nurse", email="a@b.uz", name="A")

    finished = _reload_with(monkeypatch, JWT_SECRET="yangi-kalit-0123456789abcdef", JWT_SECRET_OLD="")
    with pytest.raises(jwt.PyJWTError):
        finished.decode_token(token)


def test_an_expired_token_is_rejected_as_expired_not_retried(monkeypatch):
    """Only a signature failure may fall through to the old key.

    The two secrets must differ for this to mean anything. With the same value on both
    sides the fallback verifies and then fails on `exp` again, so a broad `except
    PyJWTError` is indistinguishable from the correct narrow one -- which is exactly
    how the first version of this test managed to pass against the broken code.

    Here the token is signed with the CURRENT key and expired. Correct code re-raises
    ExpiredSignatureError. Code that retries on any error would hand the token to a key
    that never signed it and report InvalidSignatureError, losing the real reason.
    """
    expired = _reload_with(
        monkeypatch,
        JWT_SECRET="yangi-kalit-0123456789abcdef",
        JWT_SECRET_OLD="eski-kalit-0123456789abcdef",
        JWT_EXPIRE_MINUTES="-1",
    )
    token = expired.create_access_token(staff_id=1, clinic_id=1, role="nurse", email="a@b.uz", name="A")
    with pytest.raises(jwt.ExpiredSignatureError):
        expired.decode_token(token)


def test_the_token_lifetime_is_bounded(monkeypatch):
    """A year was the old value, and it is too long for a phone that can be lost."""
    fresh = _reload_with(monkeypatch, JWT_SECRET="kalit-0123456789abcdef0123")
    assert 0 < config.JWT_EXPIRE_MINUTES <= 90 * 24 * 60
    token = fresh.create_access_token(staff_id=1, clinic_id=1, role="nurse", email="a@b.uz", name="A")
    claims = fresh.decode_token(token)
    assert claims["exp"] - claims["iat"] <= 90 * 24 * 3600
