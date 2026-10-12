"""baseline: processes, products, product_steps, step_dependencies

Tables that were previously created by Base.metadata.create_all().
Existing databases should be stamped (`alembic stamp 0001`) instead of upgraded.

Revision ID: 0001
Revises:
"""
import sqlalchemy as sa
from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "processes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("location", sa.String(), nullable=False),
        sa.Column("type", sa.String(), nullable=False),
        sa.Column("description", sa.String(), nullable=True),
        sa.Column("capacity", sa.Float(), nullable=False),
    )
    op.create_index("ix_processes_id", "processes", ["id"])
    op.create_table(
        "products",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("description", sa.String(), nullable=True),
    )
    op.create_index("ix_products_id", "products", ["id"])
    op.create_table(
        "product_steps",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("product_id", sa.Integer(), sa.ForeignKey("products.id", ondelete="CASCADE"), nullable=False),
        sa.Column("process_id", sa.Integer(), sa.ForeignKey("processes.id"), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
    )
    op.create_index("ix_product_steps_id", "product_steps", ["id"])
    op.create_table(
        "step_dependencies",
        sa.Column("step_id", sa.Integer(), sa.ForeignKey("product_steps.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("depends_on_step_id", sa.Integer(), sa.ForeignKey("product_steps.id", ondelete="CASCADE"), primary_key=True),
    )


def downgrade() -> None:
    op.drop_table("step_dependencies")
    op.drop_table("product_steps")
    op.drop_table("products")
    op.drop_table("processes")
