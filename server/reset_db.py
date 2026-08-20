"""Drop everything and recreate the multi-tenant schema from scratch.

The single-tenant prototype's tables are incompatible with the new clinic-scoped
schema (new columns, new tables), so this replaces the old create_all-based seed.py.
Safe to run repeatedly; old data (test-only) is intentionally discarded.
"""

import sys

from sqlalchemy import text

from app.database import Base, engine
from app.core.config import DATABASE_URL
from app.models import (  # noqa: F401
    Button,
    Call,
    Clinic,
    Device,
    DiscoveredDevice,
    PushToken,
    Room,
    Staff,
    UnassignedSignal,
)


def main() -> None:
    # Destructive: refuses to run without explicit confirmation so a habit-typed command
    # can't wipe a database that has real clinic data in it.
    if "--yes" not in sys.argv:
        print(f"DIQQAT: {DATABASE_URL} dagi BARCHA jadvallar o'chiriladi (DROP)!")
        answer = input("Davom etish uchun 'ha' deb yozing: ")
        if answer.strip().lower() != "ha":
            raise SystemExit("Bekor qilindi")
    with engine.begin() as conn:
        conn.execute(text("DROP TABLE IF EXISTS calls CASCADE"))
        conn.execute(text("DROP TABLE IF EXISTS push_tokens CASCADE"))
        conn.execute(text("DROP TABLE IF EXISTS unassigned_signals CASCADE"))
        conn.execute(text("DROP TABLE IF EXISTS buttons CASCADE"))
        conn.execute(text("DROP TABLE IF EXISTS discovered_devices CASCADE"))
        conn.execute(text("DROP TABLE IF EXISTS devices CASCADE"))
        conn.execute(text("DROP TABLE IF EXISTS rooms CASCADE"))
        conn.execute(text("DROP TABLE IF EXISTS staff CASCADE"))
        conn.execute(text("DROP TABLE IF EXISTS clinics CASCADE"))
    Base.metadata.create_all(bind=engine)
    print(
        "Schema reset: clinics, staff, rooms, devices, discovered_devices, buttons, "
        "unassigned_signals, push_tokens, calls"
    )


if __name__ == "__main__":
    main()
