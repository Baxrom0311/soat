"""Adds a per-clinic uniqueness guard on rooms.room_number (pre-flight confirmed zero
existing duplicate rows in production before writing this) and an optional
payments.idempotency_key column for double-submit protection on recorded payments.

Both are purely additive and safe on data that already exists: the room constraint
was verified clean, and the new payments column is nullable with a unique index that
allows any number of NULLs (Postgres unique indexes treat NULL as distinct), so every
existing payment row (which has no key) is unaffected.
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0003_room_payment"
down_revision: Union[str, None] = "0002_enum_migration"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_unique_constraint("uq_rooms_clinic_room_number", "rooms", ["clinic_id", "room_number"])

    op.add_column("payments", sa.Column("idempotency_key", sa.String(), nullable=True))
    op.create_index(
        "ix_payments_idempotency_key", "payments", ["idempotency_key"], unique=True
    )


def downgrade() -> None:
    op.drop_index("ix_payments_idempotency_key", table_name="payments")
    op.drop_column("payments", "idempotency_key")
    op.drop_constraint("uq_rooms_clinic_room_number", "rooms", type_="unique")
