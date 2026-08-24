"""Append-only audit trail for superadmin write actions: who changed what, when."""

from app.core.deps import CurrentUser
from app.models import AuditLog


def record(
    db,
    actor: CurrentUser,
    *,
    action: str,
    target_type: str,
    target_id: int | None = None,
    before: dict | None = None,
    after: dict | None = None,
    ip_address: str | None = None,
) -> None:
    """Stages an AuditLog row on the current session -- does NOT commit. Call it inside
    the same transaction as the write being audited so the two are atomic: if the write
    rolls back, the audit entry never persists either."""
    db.add(
        AuditLog(
            actor_id=actor.staff_id,
            actor_name=actor.name,
            actor_email=actor.email,
            actor_role=actor.role,
            action=action,
            target_type=target_type,
            target_id=target_id,
            before=before,
            after=after,
            ip_address=ip_address,
        )
    )
