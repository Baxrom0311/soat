"""Record which staff member acknowledged a call, not only the name they had then."""

import sqlalchemy as sa
from alembic import op

revision = "0013_call_ack_staff"
down_revision = "0012_outbox_events"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "calls",
        sa.Column(
            "acknowledged_by_staff_id",
            sa.Integer(),
            sa.ForeignKey("staff.id", ondelete="SET NULL", name="calls_acknowledged_by_staff_id_fkey"),
            nullable=True,
        ),
    )
    op.create_index("ix_calls_acknowledged_by_staff_id", "calls", ["acknowledged_by_staff_id"])


def downgrade():
    op.drop_index("ix_calls_acknowledged_by_staff_id", table_name="calls")
    op.drop_column("calls", "acknowledged_by_staff_id")
