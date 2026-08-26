"""Rework billing: per-device plan pricing with a floor, per-clinic billing period,
time-limited promotional discount, per-clinic enforcement switch and a suspension
reason.

The `plans` table is restructured destructively (price_amount / billing_period_months /
max_devices dropped, four new NOT NULL price columns added). That is safe here and only
here: production `plans` is verified EMPTY (0 rows) and every clinic has plan_id NULL,
so there is no data to migrate or lose. The guard below refuses to run if that stops
being true, rather than silently inventing prices for existing rows.

Clinic columns are purely additive with defaults, so existing rows keep working:
billing_period_months defaults to monthly, enforcement_enabled to true (a clinic whose
enforcement was silently off would run unpaid for months before anyone noticed).
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0006_billing_rework"
down_revision: Union[str, None] = "0005_contact_requests"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SUSPENSION_REASON_VALUES = ("payment_lapse", "manual")


def upgrade() -> None:
    # Refuse to destroy real pricing data. If either table has rows, a human has to
    # decide how to map the old single price onto the new per-device model.
    op.execute(
        """
        DO $$
        DECLARE plan_count integer; priced_clinics integer;
        BEGIN
            SELECT count(*) INTO plan_count FROM plans;
            SELECT count(*) INTO priced_clinics FROM clinics WHERE plan_id IS NOT NULL;
            IF plan_count > 0 OR priced_clinics > 0 THEN
                RAISE EXCEPTION
                    'plans has % row(s) and % clinic(s) reference a plan -- this migration drops the old price columns and must not run against real pricing data; migrate it by hand first',
                    plan_count, priced_clinics;
            END IF;
        END $$;
        """
    )

    # ---- plans: single price -> per-device rates + floor, per period ----
    op.add_column("plans", sa.Column("price_per_device_monthly", sa.BigInteger(), nullable=False, server_default="0"))
    op.add_column("plans", sa.Column("price_per_device_annual", sa.BigInteger(), nullable=False, server_default="0"))
    op.add_column("plans", sa.Column("min_price_monthly", sa.BigInteger(), nullable=False, server_default="0"))
    op.add_column("plans", sa.Column("min_price_annual", sa.BigInteger(), nullable=False, server_default="0"))
    # The server_defaults exist only so the ALTER succeeds on a table that might not be
    # empty in some other environment; the application always supplies these explicitly.
    for column in (
        "price_per_device_monthly",
        "price_per_device_annual",
        "min_price_monthly",
        "min_price_annual",
    ):
        op.alter_column("plans", column, server_default=None)

    op.drop_column("plans", "price_amount")
    op.drop_column("plans", "billing_period_months")
    op.drop_column("plans", "max_devices")

    # ---- clinics: period, discount, enforcement, suspension reason ----
    op.add_column(
        "clinics",
        sa.Column("billing_period_months", sa.Integer(), nullable=False, server_default="1"),
    )
    op.add_column("clinics", sa.Column("discount_percent", sa.Integer(), nullable=True))
    op.add_column("clinics", sa.Column("discount_months", sa.Integer(), nullable=True))
    op.add_column(
        "clinics", sa.Column("discount_started_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column(
        "clinics",
        sa.Column("enforcement_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
    )

    suspension_reason = sa.Enum(*SUSPENSION_REASON_VALUES, name="suspension_reason")
    suspension_reason.create(op.get_bind(), checkfirst=True)
    op.add_column("clinics", sa.Column("suspension_reason", suspension_reason, nullable=True))

    # Any clinic already sitting at 'suspended' got there by a human clicking suspend --
    # the automatic payment path did not exist yet. Labelling them MANUAL keeps them
    # from being silently unblocked by the first payment recorded after this deploy.
    op.execute(
        "UPDATE clinics SET suspension_reason = 'manual'::suspension_reason "
        "WHERE subscription_status = 'suspended'::subscription_status"
    )


def downgrade() -> None:
    op.drop_column("clinics", "suspension_reason")
    sa.Enum(name="suspension_reason").drop(op.get_bind(), checkfirst=True)
    op.drop_column("clinics", "enforcement_enabled")
    op.drop_column("clinics", "discount_started_at")
    op.drop_column("clinics", "discount_months")
    op.drop_column("clinics", "discount_percent")
    op.drop_column("clinics", "billing_period_months")

    op.add_column("plans", sa.Column("max_devices", sa.Integer(), nullable=True))
    op.add_column(
        "plans", sa.Column("billing_period_months", sa.Integer(), nullable=False, server_default="1")
    )
    op.add_column("plans", sa.Column("price_amount", sa.BigInteger(), nullable=False, server_default="0"))
    op.alter_column("plans", "billing_period_months", server_default=None)
    op.alter_column("plans", "price_amount", server_default=None)

    op.drop_column("plans", "min_price_annual")
    op.drop_column("plans", "min_price_monthly")
    op.drop_column("plans", "price_per_device_annual")
    op.drop_column("plans", "price_per_device_monthly")
