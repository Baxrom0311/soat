"""Invalidate existing credentials in the same transaction as a password change."""

from sqlalchemy import update
from sqlalchemy.orm import Session

from app.models import Staff
from app.repositories import push_token_repo
from app.ws_manager import manager


def revoke_staff_sessions(db: Session, staff_id: int) -> None:
    db.execute(update(Staff).where(Staff.id == staff_id).values(session_version=Staff.session_version + 1))
    push_token_repo.delete_all_for_staff(db, staff_id)
    manager.mark_staff_dirty(staff_id)
