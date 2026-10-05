"""Revocable staff sessions and proof of possession for device provisioning."""
from alembic import op
import sqlalchemy as sa

revision = "0011_session_provisioning"
down_revision = "0010_call_expired"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("staff", sa.Column("session_version", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("discovered_devices", sa.Column("provisioning_secret_hash", sa.String(), nullable=True))
    # Legacy discovery never proved possession; don't leave its key deliverable.
    op.execute("UPDATE devices SET pending_key_plaintext = NULL WHERE pending_key_plaintext IS NOT NULL")


def downgrade():
    op.drop_column("discovered_devices", "provisioning_secret_hash")
    op.drop_column("staff", "session_version")
