"""v4 migration: calls indexing + audit log.

Adds the composite (clinic_id, status, created_at) index on calls plus indexes on
calls.room_id / calls.device_id, and creates the audit_logs table.

Idempotent: every statement is IF NOT EXISTS / guarded, so re-running is a no-op.
Base.metadata.create_all (run on every app startup) would create audit_logs on its own
since it's a brand new table, but the CREATE INDEXes on the existing calls table need
this script -- create_all never modifies existing tables.

SUPERSEDED BY ALEMBIC: schema changes now live under migrations/versions/ and are
applied with `alembic upgrade head`. This script is kept only as a historical record
of the hand-rolled migration that predated Alembic in this project -- it is not part
of the deploy path and must not be run again as a matter of course. If you ever
think you need to run it, first run `alembic current` to see what the target
database's schema state actually is; if Alembic already covers these indexes/tables
(it does, as of the baseline + enum revisions), running this script is redundant at
best and, against a database whose schema has since moved on, at worst.
"""

from sqlalchemy import text

from app.database import Base, engine
from app.models import AuditLog  # noqa: F401  (registers the table with Base.metadata)


def main() -> None:
    with engine.begin() as conn:
        conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_calls_clinic_status_created "
                "ON calls (clinic_id, status, created_at)"
            )
        )
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_calls_room_id ON calls (room_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_calls_device_id ON calls (device_id)"))
        print("calls indexes ensured")

    Base.metadata.create_all(bind=engine, tables=[AuditLog.__table__])
    print("audit_logs table ensured")


if __name__ == "__main__":
    main()
