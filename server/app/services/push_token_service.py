"""Registration/unregistration of a staff member's Expo push token.

Mobile app calls POST on every login (a fresh install/reinstall can get a new Expo
token) and DELETE on logout so stale tokens don't keep receiving pushes.
"""

from sqlalchemy.orm import Session

from app.repositories import push_token_repo


def register_token(db: Session, *, clinic_id: int, staff_id: int, token: str) -> None:
    push_token_repo.upsert(db, clinic_id=clinic_id, staff_id=staff_id, token=token)
    db.commit()


def unregister_token(db: Session, *, clinic_id: int, staff_id: int, token: str) -> None:
    push_token_repo.delete(db, clinic_id=clinic_id, staff_id=staff_id, token=token)
    db.commit()
