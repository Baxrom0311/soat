"""Remember which receivers the vendor has already been paged about.

The offline alert needs one bit of memory: has this device's outage already been
reported? Without it a receiver that has been dead for three days is announced on every
run of the timer, and an alert that fires constantly is one nobody reads -- which is the
same as having no alert at all.

NULL means "not currently reported as offline". The job sets it when it sends an alert
and clears it when the device heartbeats again (which is also what triggers the recovery
message).

Revision ID: 0007_device_offline
Revises: 0006_billing_rework
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0007_device_offline"
down_revision: Union[str, None] = "0006_billing_rework"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "devices",
        sa.Column("offline_alerted_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("devices", "offline_alerted_at")
