"""Outbox for live events: cross-process realtime and push that survives a restart."""

import sqlalchemy as sa
from alembic import op

revision = "0012_outbox_events"
down_revision = "0011_session_provisioning"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "outbox_events",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("clinic_id", sa.Integer(), sa.ForeignKey("clinics.id", ondelete="CASCADE"), nullable=False),
        sa.Column("message", sa.JSON(), nullable=False),
        sa.Column("floor", sa.Integer(), nullable=True),
        sa.Column("origin", sa.String(), nullable=False),
        sa.Column("push", sa.JSON(), nullable=True),
        sa.Column("push_claimed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("push_done_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("push_attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index(
        "ix_outbox_events_push_due",
        "outbox_events",
        ["created_at"],
        postgresql_where=sa.text("push IS NOT NULL AND push_done_at IS NULL"),
    )


def downgrade():
    op.drop_index("ix_outbox_events_push_due", table_name="outbox_events")
    op.drop_table("outbox_events")
