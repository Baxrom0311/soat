"""v2 migration for existing databases. `create_all` only creates *missing tables*;
it never alters an existing one, so every schema change since the original single-tenant
build has to be applied here by hand. Fully idempotent (IF EXISTS / IF NOT EXISTS
everywhere), so it is safe to re-run and safe on a brand-new DB alike.

Covers:
  - staff.clinic_id -> nullable (superadmin accounts have no clinic)
  - calls.press_id  -> firmware idempotency key + unique index
  - devices.{chip_id, pending_key_plaintext, key_delivered_at} -> zero-touch provisioning
    (the discovered_devices table itself is a NEW table, so create_all makes it — only
     the columns added to the pre-existing devices table need patching here)

Run once against DATABASE_URL after pulling new code:  python migrate_v2.py
"""

from sqlalchemy import text

from app.database import Base, engine


def main() -> None:
    # Make sure any genuinely-new tables (e.g. discovered_devices) exist before we
    # start altering columns that reference them.
    Base.metadata.create_all(bind=engine)

    with engine.begin() as conn:
        is_nullable = conn.execute(
            text(
                "SELECT is_nullable FROM information_schema.columns "
                "WHERE table_name = 'staff' AND column_name = 'clinic_id'"
            )
        ).scalar()
        if is_nullable is None:
            print("staff.clinic_id not found — run the app once (or reset_db.py) to create the schema first")
            return
        if is_nullable == "YES":
            print("staff.clinic_id is already nullable — nothing to do")
        else:
            conn.execute(text("ALTER TABLE staff ALTER COLUMN clinic_id DROP NOT NULL"))
            print("staff.clinic_id is now nullable")

        conn.execute(text("ALTER TABLE calls ADD COLUMN IF NOT EXISTS press_id VARCHAR"))
        conn.execute(
            text("CREATE UNIQUE INDEX IF NOT EXISTS uq_calls_press_id ON calls (press_id)")
        )
        print("calls.press_id column + unique index ensured")

        # Zero-touch provisioning columns on the pre-existing devices table.
        conn.execute(text("ALTER TABLE devices ADD COLUMN IF NOT EXISTS chip_id VARCHAR"))
        conn.execute(text("ALTER TABLE devices ADD COLUMN IF NOT EXISTS pending_key_plaintext VARCHAR"))
        conn.execute(
            text("ALTER TABLE devices ADD COLUMN IF NOT EXISTS key_delivered_at TIMESTAMP WITH TIME ZONE")
        )
        conn.execute(
            text("CREATE UNIQUE INDEX IF NOT EXISTS ix_devices_chip_id ON devices (chip_id)")
        )
        print("devices.{chip_id, pending_key_plaintext, key_delivered_at} + index ensured")

        # Billing columns on the pre-existing clinics table (plans + payments are NEW
        # tables, so create_all above already made them).
        conn.execute(text("ALTER TABLE clinics ADD COLUMN IF NOT EXISTS plan_id INTEGER REFERENCES plans(id)"))
        conn.execute(text("ALTER TABLE clinics ADD COLUMN IF NOT EXISTS custom_price_amount BIGINT"))
        conn.execute(
            text("ALTER TABLE clinics ADD COLUMN IF NOT EXISTS paid_until TIMESTAMP WITH TIME ZONE")
        )
        print("clinics.{plan_id, custom_price_amount, paid_until} ensured")


if __name__ == "__main__":
    main()
