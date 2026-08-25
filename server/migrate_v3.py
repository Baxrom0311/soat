"""v3 migration: zero-touch ESP32 discovery & claim.

Adds devices.chip_id / devices.pending_key_plaintext / devices.key_delivered_at, and
creates the discovered_devices table. Runs against the configured DATABASE_URL from
.env / app.core.config.

Idempotent: every statement is IF NOT EXISTS / guarded, so re-running is a no-op.
Base.metadata.create_all (run on every app startup) would create discovered_devices
on its own since it's a brand new table, but the ALTER TABLEs on the existing devices
table need this script -- create_all never modifies existing tables.

SUPERSEDED BY ALEMBIC: schema changes now live under migrations/versions/ and are
applied with `alembic upgrade head`. This script is kept only as a historical record
of the hand-rolled migration that predated Alembic in this project -- it is not part
of the deploy path and must not be run again as a matter of course. If you ever
think you need to run it, first run `alembic current` to see what the target
database's schema state actually is; if Alembic already covers these columns/tables
(it does, as of the baseline + enum revisions), running this script is redundant at
best and, against a database whose schema has since moved on, at worst.
"""

from sqlalchemy import text

from app.database import Base, engine
from app.models import DiscoveredDevice  # noqa: F401  (registers the table with Base.metadata)


def main() -> None:
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE devices ADD COLUMN IF NOT EXISTS chip_id VARCHAR"))
        conn.execute(
            text("CREATE UNIQUE INDEX IF NOT EXISTS ix_devices_chip_id ON devices (chip_id)")
        )
        conn.execute(
            text("ALTER TABLE devices ADD COLUMN IF NOT EXISTS pending_key_plaintext VARCHAR")
        )
        conn.execute(
            text("ALTER TABLE devices ADD COLUMN IF NOT EXISTS key_delivered_at TIMESTAMPTZ")
        )
        print("devices.chip_id / pending_key_plaintext / key_delivered_at ensured")

    Base.metadata.create_all(bind=engine, tables=[DiscoveredDevice.__table__])
    print("discovered_devices table ensured")


if __name__ == "__main__":
    main()
