"""Convert staff.role, clinics.subscription_status, and calls.status from
unconstrained VARCHAR to native Postgres ENUM types, matching the new SQLAlchemy
StaffRole / SubscriptionStatus / CallStatus enums in app/enums.py + app/models.py.

Wire values are UNCHANGED. Every string this table has ever legitimately held
('superadmin'/'admin'/'nurse', 'trial'/'active'/'suspended', 'active'/'acknowledged')
is a valid member of its new enum type, so the USING cast is a straight relabel with
zero data transformation -- PROVIDED no row currently holds a value outside that set.
The _guard() calls below verify that with an actionable error before any DDL runs; see
migrationNotes for the exact pre-flight SQL a human should also run by hand first.
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002_enum_migration"
down_revision: Union[str, None] = "0001_baseline_schema"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

STAFF_ROLE_VALUES = ("superadmin", "admin", "nurse")
SUBSCRIPTION_STATUS_VALUES = ("trial", "active", "suspended")
CALL_STATUS_VALUES = ("active", "acknowledged")


def _guard(table: str, column: str, allowed: tuple[str, ...]) -> None:
    """Abort the whole migration (Alembic wraps each revision in one transaction on
    Postgres, so this rolls back cleanly) if any row holds a value outside the allowed
    set, with a clear message -- rather than letting the later ALTER ... USING ...::enum
    fail with a generic 'invalid input value for enum' error that doesn't say which row
    or how many."""
    allowed_sql = ", ".join(f"'{v}'" for v in allowed)
    # Plain comma-joined, no quote characters: this text is interpolated INSIDE a
    # single-quoted PL/pgSQL string literal below, and Python's tuple repr (which
    # f"{allowed}" would produce) wraps each value in single quotes -- those would
    # prematurely terminate the literal and break the DO block with a syntax error.
    allowed_display = ", ".join(allowed)
    op.execute(
        f"""
        DO $$
        DECLARE bad_count integer;
        BEGIN
            SELECT count(*) INTO bad_count FROM {table} WHERE {column} NOT IN ({allowed_sql});
            IF bad_count > 0 THEN
                RAISE EXCEPTION
                    '{table}.{column} has % row(s) with a value outside the allowed set ({allowed_display}) -- fix or remap them, then re-run this migration',
                    bad_count;
            END IF;
        END $$;
        """
    )


def upgrade() -> None:
    _guard("staff", "role", STAFF_ROLE_VALUES)
    _guard("clinics", "subscription_status", SUBSCRIPTION_STATUS_VALUES)
    _guard("calls", "status", CALL_STATUS_VALUES)

    staff_role = sa.Enum(*STAFF_ROLE_VALUES, name="staff_role")
    subscription_status = sa.Enum(*SUBSCRIPTION_STATUS_VALUES, name="subscription_status")
    call_status = sa.Enum(*CALL_STATUS_VALUES, name="call_status")

    bind = op.get_bind()
    staff_role.create(bind, checkfirst=True)
    subscription_status.create(bind, checkfirst=True)
    call_status.create(bind, checkfirst=True)

    # staff.role has no column default today -- plain type swap.
    op.execute("ALTER TABLE staff ALTER COLUMN role TYPE staff_role USING role::text::staff_role")

    # clinics.subscription_status / calls.status have VARCHAR server_defaults that must
    # be dropped before the type change (Postgres will not implicitly cast an existing
    # text default literal to the new enum type mid-ALTER) and re-added afterwards, cast
    # to the enum type.
    op.execute("ALTER TABLE clinics ALTER COLUMN subscription_status DROP DEFAULT")
    op.execute(
        "ALTER TABLE clinics ALTER COLUMN subscription_status "
        "TYPE subscription_status USING subscription_status::text::subscription_status"
    )
    op.execute("ALTER TABLE clinics ALTER COLUMN subscription_status SET DEFAULT 'trial'::subscription_status")

    op.execute("ALTER TABLE calls ALTER COLUMN status DROP DEFAULT")
    op.execute(
        "ALTER TABLE calls ALTER COLUMN status TYPE call_status USING status::text::call_status"
    )
    op.execute("ALTER TABLE calls ALTER COLUMN status SET DEFAULT 'active'::call_status")


def downgrade() -> None:
    op.execute("ALTER TABLE calls ALTER COLUMN status DROP DEFAULT")
    op.execute("ALTER TABLE calls ALTER COLUMN status TYPE VARCHAR USING status::text")
    op.execute("ALTER TABLE calls ALTER COLUMN status SET DEFAULT 'active'")

    op.execute("ALTER TABLE clinics ALTER COLUMN subscription_status DROP DEFAULT")
    op.execute(
        "ALTER TABLE clinics ALTER COLUMN subscription_status TYPE VARCHAR USING subscription_status::text"
    )
    op.execute("ALTER TABLE clinics ALTER COLUMN subscription_status SET DEFAULT 'trial'")

    op.execute("ALTER TABLE staff ALTER COLUMN role TYPE VARCHAR USING role::text")

    bind = op.get_bind()
    sa.Enum(name="call_status").drop(bind, checkfirst=True)
    sa.Enum(name="subscription_status").drop(bind, checkfirst=True)
    sa.Enum(name="staff_role").drop(bind, checkfirst=True)
