"""Adds staff_floor_assignments: which floor(s) a nurse is responsible for. A staff
row with zero rows here is unrestricted (sees/gets notified of every floor) -- the
safe default so nothing silently stops alerting a nurse until an admin explicitly
assigns floors. Purely additive; no existing table or column is touched.
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0004_staff_floors"
down_revision: Union[str, None] = "0003_room_payment"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "staff_floor_assignments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "staff_id", sa.Integer(), sa.ForeignKey("staff.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("floor", sa.Integer(), nullable=False),
        sa.UniqueConstraint("staff_id", "floor", name="uq_staff_floor_assignments_staff_floor"),
    )
    op.create_index(
        "ix_staff_floor_assignments_staff_id", "staff_floor_assignments", ["staff_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_staff_floor_assignments_staff_id", table_name="staff_floor_assignments")
    op.drop_table("staff_floor_assignments")
