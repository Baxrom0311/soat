"""Registration/unregistration of a staff member's Expo push token.

Mobile app calls POST on every login (a fresh install/reinstall can get a new Expo
token) and DELETE on logout so stale tokens don't keep receiving pushes.

The endpoint is reachable by any clinic member and is deliberately NOT billing-gated
(it is part of the alerting path), so it needs its own guards:

  * Format + length validation. The column was an unbounded String taking an
    unvalidated str, so a caller could insert unlimited distinct junk rows. Every
    subsequent real call then fans out ceil(N/100) sequential Expo requests at a 10s
    timeout each -- 100k junk rows would mean hours of background work per button
    press, i.e. genuine nurse notifications delayed indefinitely. Validation plus a
    per-staff cap makes that unreachable.

  * Ownership on re-point. upsert() matches on the token VALUE alone (Expo tokens are
    globally unique to a device), which is right for "same phone, new login" but meant
    anyone who learned another clinic's Expo token could re-point it at themselves and
    silently stop that nurse's call notifications. A token already owned by a different
    staff member is now refused.
"""

import re

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.repositories import push_token_repo

# Expo's documented shapes: ExponentPushToken[...] and the newer ExpoPushToken[...].
_EXPO_TOKEN_RE = re.compile(r"^Expo(nent)?PushToken\[[A-Za-z0-9_-]{1,128}\]$")

# One row per physical device a nurse actually carries. A generous ceiling that still
# bounds the Expo fan-out per clinic.
MAX_TOKENS_PER_STAFF = 10


def _validate(token: str) -> str:
    token = token.strip()
    if not _EXPO_TOKEN_RE.match(token):
        raise HTTPException(status_code=422, detail="Push token formati noto'g'ri")
    return token


def register_token(db: Session, *, clinic_id: int, staff_id: int, token: str) -> None:
    token = _validate(token)

    existing = push_token_repo.get_by_token(db, token)
    if existing is not None and existing.staff_id != staff_id:
        # Same device now used by a different account in the SAME clinic is a normal
        # handover (shared ward phone), so allow it; across clinics it is a hijack.
        if existing.clinic_id != clinic_id:
            raise HTTPException(status_code=409, detail="Bu push token boshqa hisobga tegishli")

    if existing is None and push_token_repo.count_for_staff(db, staff_id) >= MAX_TOKENS_PER_STAFF:
        raise HTTPException(
            status_code=409,
            detail=f"Bitta xodim uchun ko'pi bilan {MAX_TOKENS_PER_STAFF} qurilma ulanishi mumkin",
        )

    push_token_repo.upsert(db, clinic_id=clinic_id, staff_id=staff_id, token=token)
    db.commit()


def unregister_token(db: Session, *, clinic_id: int, staff_id: int, token: str) -> None:
    # No validation here on purpose: a caller must always be able to clean up a row,
    # including one written before the format check existed. The delete is already
    # scoped to the caller's own clinic_id + staff_id, so it can't remove anyone else's.
    push_token_repo.delete(db, clinic_id=clinic_id, staff_id=staff_id, token=token.strip())
    db.commit()
