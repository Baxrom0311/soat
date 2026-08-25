"""Baseline: reproduces the CURRENT production schema exactly (all 12 tables, as they
exist today after migrate_v2.py/v3.py/v4.py have already been applied by hand).

UPGRADE PATH FOR PRODUCTION: do NOT run `alembic upgrade` through this revision on the
existing production database -- every table below already exists there, and
op.create_table would fail with 'relation already exists'. Production must instead run:

    alembic stamp 0001_baseline_schema

which records this revision id in the alembic_version table WITHOUT executing any DDL,
since the schema this revision describes is already physically present.

This revision's upgrade()/downgrade() pair exists so that a brand-new, EMPTY database
(local dev machine, CI, a disaster-recovery restore target) can run a plain
`alembic upgrade head` from nothing and get the identical schema, and can be torn back
down with `alembic downgrade base` for test cleanup. All columns here are still plain
String/VARCHAR -- the string-to-enum conversion happens in the next revision
(0002_string_columns_to_native_enums), matching the real historical order of events
(the app ran for a long time with plain strings before this rewrite).
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0001_baseline_schema"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "plans",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(), nullable=False, unique=True),
        sa.Column("price_amount", sa.BigInteger(), nullable=False),
        sa.Column("currency", sa.String(), nullable=False, server_default="UZS"),
        sa.Column("billing_period_months", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("max_devices", sa.Integer(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )

    op.create_table(
        "clinics",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("subscription_status", sa.String(), nullable=False, server_default="trial"),
        sa.Column("plan_id", sa.Integer(), sa.ForeignKey("plans.id"), nullable=True),
        sa.Column("custom_price_amount", sa.BigInteger(), nullable=True),
        sa.Column("paid_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )

    op.create_table(
        "staff",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("clinic_id", sa.Integer(), sa.ForeignKey("clinics.id"), nullable=True),
        sa.Column("email", sa.String(), nullable=False, unique=True),
        sa.Column("password_hash", sa.String(), nullable=False),
        sa.Column("role", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_staff_email", "staff", ["email"], unique=True)

    op.create_table(
        "rooms",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("clinic_id", sa.Integer(), sa.ForeignKey("clinics.id"), nullable=False),
        sa.Column("room_number", sa.String(), nullable=False),
        sa.Column("floor", sa.Integer(), nullable=False),
    )
    op.create_index("ix_rooms_clinic_id", "rooms", ["clinic_id"])

    op.create_table(
        "devices",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("clinic_id", sa.Integer(), sa.ForeignKey("clinics.id"), nullable=False),
        sa.Column("device_id", sa.String(), nullable=False, unique=True),
        sa.Column("device_api_key_hash", sa.String(), nullable=False),
        sa.Column("floor", sa.Integer(), nullable=False),
        sa.Column("chip_id", sa.String(), nullable=True, unique=True),
        sa.Column("pending_key_plaintext", sa.String(), nullable=True),
        sa.Column("key_delivered_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_devices_clinic_id", "devices", ["clinic_id"])
    op.create_index("ix_devices_device_id", "devices", ["device_id"], unique=True)
    op.create_index("ix_devices_chip_id", "devices", ["chip_id"], unique=True)

    op.create_table(
        "payments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("clinic_id", sa.Integer(), sa.ForeignKey("clinics.id"), nullable=False),
        sa.Column("amount", sa.BigInteger(), nullable=False),
        sa.Column("period_months", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("note", sa.String(), nullable=True),
        sa.Column("recorded_by", sa.String(), nullable=True),
        sa.Column("paid_until_after", sa.DateTime(timezone=True), nullable=True),
        sa.Column("paid_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_payments_clinic_id", "payments", ["clinic_id"])

    op.create_table(
        "discovered_devices",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("chip_id", sa.String(), nullable=False, unique=True),
        sa.Column("first_seen_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("last_ip", sa.String(), nullable=True),
        sa.Column("claimed_device_id", sa.Integer(), sa.ForeignKey("devices.id"), nullable=True),
    )
    op.create_index("ix_discovered_devices_chip_id", "discovered_devices", ["chip_id"], unique=True)

    op.create_table(
        "buttons",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("clinic_id", sa.Integer(), sa.ForeignKey("clinics.id"), nullable=False),
        sa.Column("room_id", sa.Integer(), sa.ForeignKey("rooms.id"), nullable=False),
        sa.Column("ev1527_code", sa.BigInteger(), nullable=False),
        sa.UniqueConstraint("clinic_id", "ev1527_code", name="uq_buttons_clinic_code"),
    )
    op.create_index("ix_buttons_clinic_id", "buttons", ["clinic_id"])

    op.create_table(
        "unassigned_signals",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("clinic_id", sa.Integer(), sa.ForeignKey("clinics.id"), nullable=False),
        sa.Column("device_id", sa.Integer(), sa.ForeignKey("devices.id"), nullable=False),
        sa.Column("ev1527_code", sa.BigInteger(), nullable=False),
        sa.Column("first_seen_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("seen_count", sa.Integer(), nullable=False, server_default="1"),
        sa.UniqueConstraint("clinic_id", "ev1527_code", name="uq_unassigned_clinic_code"),
    )
    op.create_index("ix_unassigned_signals_clinic_id", "unassigned_signals", ["clinic_id"])

    op.create_table(
        "push_tokens",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("clinic_id", sa.Integer(), sa.ForeignKey("clinics.id"), nullable=False),
        sa.Column("staff_id", sa.Integer(), sa.ForeignKey("staff.id"), nullable=False),
        sa.Column("expo_push_token", sa.String(), nullable=False, unique=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_push_tokens_clinic_id", "push_tokens", ["clinic_id"])
    op.create_index("ix_push_tokens_staff_id", "push_tokens", ["staff_id"])
    op.create_index("ix_push_tokens_expo_push_token", "push_tokens", ["expo_push_token"], unique=True)

    op.create_table(
        "calls",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("clinic_id", sa.Integer(), sa.ForeignKey("clinics.id"), nullable=False),
        sa.Column("room_id", sa.Integer(), sa.ForeignKey("rooms.id"), nullable=False),
        sa.Column("device_id", sa.Integer(), sa.ForeignKey("devices.id"), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="active"),
        sa.Column("press_id", sa.String(), nullable=True, unique=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("acknowledged_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("acknowledged_by", sa.String(), nullable=True),
    )
    op.create_index("ix_calls_clinic_id", "calls", ["clinic_id"])
    op.create_index("ix_calls_room_id", "calls", ["room_id"])
    op.create_index("ix_calls_device_id", "calls", ["device_id"])
    op.create_index("ix_calls_clinic_status_created", "calls", ["clinic_id", "status", "created_at"])

    op.create_table(
        "audit_logs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("actor_id", sa.Integer(), sa.ForeignKey("staff.id", ondelete="SET NULL"), nullable=True),
        sa.Column("actor_name", sa.String(), nullable=False),
        sa.Column("actor_email", sa.String(), nullable=False),
        sa.Column("actor_role", sa.String(), nullable=False),
        sa.Column("action", sa.String(), nullable=False),
        sa.Column("target_type", sa.String(), nullable=False),
        sa.Column("target_id", sa.Integer(), nullable=True),
        sa.Column("before", sa.JSON(), nullable=True),
        sa.Column("after", sa.JSON(), nullable=True),
        sa.Column("ip_address", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_audit_logs_action", "audit_logs", ["action"])
    op.create_index("ix_audit_logs_created_at", "audit_logs", ["created_at"])
    op.create_index("ix_audit_logs_actor_created", "audit_logs", ["actor_id", "created_at"])


def downgrade() -> None:
    # Reverse dependency order. NEVER run this against the production database -- it
    # drops every table in the system, including live patient-call data. This exists
    # only so a disposable/local/CI database created via `alembic upgrade head` can also
    # be torn down cleanly with `alembic downgrade base`.
    op.drop_table("audit_logs")
    op.drop_table("calls")
    op.drop_table("push_tokens")
    op.drop_table("unassigned_signals")
    op.drop_table("buttons")
    op.drop_table("discovered_devices")
    op.drop_table("payments")
    op.drop_table("devices")
    op.drop_table("rooms")
    op.drop_table("staff")
    op.drop_table("clinics")
    op.drop_table("plans")
