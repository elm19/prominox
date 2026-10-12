"""RRT: real-time reception of sensor data from Node-RED

Revision ID: 0005
Revises: 0004
"""
import sqlalchemy as sa
from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("processes", sa.Column("rrt_enabled", sa.Boolean(), nullable=False, server_default="false"))
    op.add_column("processes", sa.Column("rrt_token", sa.String(), nullable=True))
    op.add_column("processes", sa.Column("rrt_enabled_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("processes", sa.Column("rrt_last_received_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("processes", sa.Column("rrt_last_error", sa.String(), nullable=True))
    op.add_column("processes", sa.Column("rrt_last_error_at", sa.DateTime(timezone=True), nullable=True))
    op.create_unique_constraint("uq_processes_rrt_token", "processes", ["rrt_token"])


def downgrade() -> None:
    op.drop_constraint("uq_processes_rrt_token", "processes", type_="unique")
    for column in ("rrt_last_error_at", "rrt_last_error", "rrt_last_received_at", "rrt_enabled_at", "rrt_token", "rrt_enabled"):
        op.drop_column("processes", column)
