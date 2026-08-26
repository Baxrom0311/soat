"""Adds contact_requests: lead capture from the public marketing landing page. The
row has no clinic_id -- the submitter is a prospective customer with no account yet.
Purely additive; no existing table or column is touched.
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0005_contact_requests"
down_revision: Union[str, None] = "0004_staff_floors"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "contact_requests",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("phone", sa.String(), nullable=False),
        sa.Column("clinic_name", sa.String(), nullable=True),
        sa.Column("message", sa.String(), nullable=True),
        sa.Column("source_ip", sa.String(), nullable=True),
        sa.Column("handled", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
    )
    op.create_index("ix_contact_requests_created_at", "contact_requests", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_contact_requests_created_at", table_name="contact_requests")
    op.drop_table("contact_requests")
