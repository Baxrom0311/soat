"""Deleting a receiver must not delete the ward's call history.

Three foreign keys pointed at devices.id and each one made "delete this receiver" behave
badly:

  * calls.device_id -- RESTRICT, so a raw DELETE was refused outright. The application
    worked around it by deleting the calls first, which meant replacing a receiver
    silently destroyed the clinic's record of every call it had ever relayed. Devices in
    production carry up to 370 calls; nine devices were deleted on 5 September and took
    their history with them. A call record says "room 304 called at 14:32 and was
    acknowledged after three minutes" -- that is the ward's operational record, and which
    box relayed the signal is incidental to it. So: the column becomes nullable and the
    key becomes SET NULL. The history survives, minus a pointer nothing displays.

  * unassigned_signals.device_id -- RESTRICT, and this one actually fired: any clinic
    whose receiver had overheard a stray EV1527 code could not delete that receiver at
    all, it just 500ed. These rows ARE that device's observations and describe nothing
    once it is gone, so they go with it: CASCADE.

  * discovered_devices.claimed_device_id -- RESTRICT. On delete it becomes NULL, which
    also returns the chip to the "unclaimed" state it must be in before it can be adopted
    into another clinic. Deleting the device was already the gesture for freeing a
    receiver for reuse; now the ledger agrees.

Putting all three rules in the schema rather than in device_repo.delete() is deliberate:
the API path and a hand-written SQL DELETE now do the same thing. They did not before,
which is how the calls problem stayed hidden -- the code path quietly deleted history the
FK would have refused.

Revision ID: 0008_device_delete
Revises: 0007_device_offline
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0008_device_delete"
down_revision: Union[str, None] = "0007_device_offline"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column("calls", "device_id", existing_type=sa.Integer(), nullable=True)
    op.drop_constraint("calls_device_id_fkey", "calls", type_="foreignkey")
    op.create_foreign_key(
        "calls_device_id_fkey", "calls", "devices", ["device_id"], ["id"], ondelete="SET NULL"
    )

    op.drop_constraint(
        "unassigned_signals_device_id_fkey", "unassigned_signals", type_="foreignkey"
    )
    op.create_foreign_key(
        "unassigned_signals_device_id_fkey",
        "unassigned_signals",
        "devices",
        ["device_id"],
        ["id"],
        ondelete="CASCADE",
    )

    op.drop_constraint(
        "discovered_devices_claimed_device_id_fkey", "discovered_devices", type_="foreignkey"
    )
    op.create_foreign_key(
        "discovered_devices_claimed_device_id_fkey",
        "discovered_devices",
        "devices",
        ["claimed_device_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        "discovered_devices_claimed_device_id_fkey", "discovered_devices", type_="foreignkey"
    )
    op.create_foreign_key(
        "discovered_devices_claimed_device_id_fkey",
        "discovered_devices",
        "devices",
        ["claimed_device_id"],
        ["id"],
    )

    op.drop_constraint(
        "unassigned_signals_device_id_fkey", "unassigned_signals", type_="foreignkey"
    )
    op.create_foreign_key(
        "unassigned_signals_device_id_fkey",
        "unassigned_signals",
        "devices",
        ["device_id"],
        ["id"],
    )

    op.drop_constraint("calls_device_id_fkey", "calls", type_="foreignkey")
    op.create_foreign_key("calls_device_id_fkey", "calls", "devices", ["device_id"], ["id"])
    # Rows orphaned while the new rule was in force have no device to point back at, so
    # NOT NULL cannot be restored without inventing data. Left nullable on purpose --
    # a downgrade that silently deleted those calls would repeat the original bug.
