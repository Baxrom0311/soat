"""Add the 'expired' call status.

Calls were only ever created or acknowledged; nothing closed one. Measured when this was
written, twenty-eight calls were still 'active' across four clinics, twenty-two of them
at one clinic and the oldest six days old. Those rows are not patients waiting -- they
are calls no shift ever closed -- but every count, every nurse's screen and every repeat
alert had to keep treating them as live, because the schema had no way to say otherwise.

This only adds the value. Nothing is expired by it: jobs/expire_stale_calls.py does that,
so the schema change and the first row it touches are separate events, and the rollout
can be watched in between.

Adding a value to a native enum cannot run inside a transaction on older PostgreSQL, and
cannot be undone at all -- there is no DROP VALUE. The downgrade therefore converts any
expired row back to the closest honest thing (active, which is what it was) and leaves
the unused value in place rather than pretending it can be removed.

Revision ID: 0010_call_expired
Revises: 0009_trial_expiry
"""

from typing import Sequence, Union

from alembic import op

revision: str = "0010_call_expired"
down_revision: Union[str, None] = "0009_trial_expiry"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # IF NOT EXISTS so a re-run after a partial failure is harmless; the statement is
    # committed on its own because ALTER TYPE ... ADD VALUE may not share a transaction
    # with later use of the value.
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE call_status ADD VALUE IF NOT EXISTS 'expired'")


def downgrade() -> None:
    # Reopening them is the truthful reverse: before this migration they were active,
    # and no nurse acknowledged them in the meantime.
    op.execute("UPDATE calls SET status = 'active' WHERE status = 'expired'")
