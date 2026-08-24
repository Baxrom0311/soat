"""DB access for the AuditLog table."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AuditLog


def list_recent(db: Session, *, limit: int = 100, offset: int = 0) -> list[AuditLog]:
    return list(
        db.scalars(
            select(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit).offset(offset)
        ).all()
    )
