"""Give a trial an end date, without ending anybody's trial.

Trial clinics were never payment-gated at all: every rule in app.core.billing began by
returning early for TRIAL, so the overdue/grace/blocked machinery was correct and simply
never reached. Three clinics were running free indefinitely as a result, and nothing
anywhere would ever have said so.

This adds the missing date. It is NULL for every existing clinic, and NULL means exactly
what the old behaviour did -- the trial never lapses on its own. Setting a date is what
arms the timer, one clinic at a time, so the mechanism can ship before the conversations
with those clinics have happened.

Revision ID: 0009_trial_expiry
Revises: 0008_device_delete
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0009_trial_expiry"
down_revision: Union[str, None] = "0008_device_delete"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "clinics", sa.Column("trial_ends_at", sa.DateTime(timezone=True), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("clinics", "trial_ends_at")
