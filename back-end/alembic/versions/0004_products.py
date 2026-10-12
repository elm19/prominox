"""products: reference/specs/files, routing details, production history

Revision ID: 0004
Revises: 0003
"""
import sqlalchemy as sa
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None

PALETTE = ["#38bdf8", "#f59e0b", "#34d399", "#a78bfa", "#fb7185", "#14b8a6", "#f97316", "#facc15"]


def upgrade() -> None:
    # --- products ---
    op.add_column("products", sa.Column("reference", sa.String(), nullable=True))
    op.add_column("products", sa.Column("category", sa.String(), nullable=True))
    op.add_column("products", sa.Column("material", sa.String(), nullable=True))
    op.add_column("products", sa.Column("standard", sa.String(), nullable=True))
    op.add_column("products", sa.Column("unit", sa.String(), nullable=False, server_default="piece"))
    op.add_column("products", sa.Column("revision", sa.String(), nullable=False, server_default="1"))
    op.add_column("products", sa.Column("status", sa.String(), nullable=False, server_default="active"))
    op.add_column("products", sa.Column("color", sa.String(), nullable=False, server_default="#38bdf8"))
    op.add_column("products", sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()))
    op.add_column("products", sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()))
    op.execute("UPDATE products SET reference = 'PRD-' || id")
    cases = " ".join(f"WHEN {i} THEN '{c}'" for i, c in enumerate(PALETTE))
    op.execute(f"UPDATE products SET color = CASE (id % {len(PALETTE)}) {cases} END")
    op.alter_column("products", "reference", nullable=False)
    op.create_unique_constraint("uq_products_reference", "products", ["reference"])
    op.create_check_constraint("ck_products_status", "products", "status IN ('active', 'archived')")

    op.create_table(
        "product_specs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("product_id", sa.Integer(), sa.ForeignKey("products.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("value", sa.String(), nullable=False),
        sa.Column("unit", sa.String(), nullable=True),
        sa.UniqueConstraint("product_id", "name", name="uq_product_specs_product_name"),
    )
    op.create_index("ix_product_specs_product_id", "product_specs", ["product_id"])

    op.create_table(
        "product_files",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("product_id", sa.Integer(), sa.ForeignKey("products.id", ondelete="CASCADE"), nullable=False),
        sa.Column("kind", sa.String(), nullable=False),
        sa.Column("filename", sa.String(), nullable=False),
        sa.Column("stored_name", sa.String(), nullable=False, unique=True),
        sa.Column("content_type", sa.String(), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("kind IN ('image', 'pdf')", name="ck_product_files_kind"),
    )
    op.create_index("ix_product_files_product_id", "product_files", ["product_id"])

    # --- routing steps ---
    op.add_column("product_steps", sa.Column("sequence", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("product_steps", sa.Column("description", sa.String(), nullable=True))
    op.add_column("product_steps", sa.Column("standard_duration_minutes", sa.Float(), nullable=True))
    op.execute(
        "UPDATE product_steps SET sequence = s.rn FROM "
        "(SELECT id, ROW_NUMBER() OVER (PARTITION BY product_id ORDER BY id) AS rn FROM product_steps) s "
        "WHERE product_steps.id = s.id"
    )
    op.create_check_constraint(
        "ck_product_steps_duration", "product_steps", "standard_duration_minutes IS NULL OR standard_duration_minutes >= 0"
    )

    # --- production history ---
    op.create_table(
        "production_runs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("product_id", sa.Integer(), sa.ForeignKey("products.id", ondelete="CASCADE"), nullable=False),
        sa.Column("batch_number", sa.String(), nullable=False),
        sa.Column("customer_order", sa.String(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("quantity_produced", sa.Float(), nullable=False),
        sa.Column("quantity_scrap", sa.Float(), nullable=False, server_default="0"),
        sa.Column("notes", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("product_id", "batch_number", name="uq_production_runs_product_batch"),
        sa.CheckConstraint("ended_at >= started_at", name="ck_production_runs_dates"),
        sa.CheckConstraint("quantity_produced >= 0 AND quantity_scrap >= 0", name="ck_production_runs_quantities"),
    )
    op.create_index("ix_production_runs_id", "production_runs", ["id"])
    op.create_index("ix_production_runs_product_id", "production_runs", ["product_id"])
    op.create_index("ix_production_runs_started_at", "production_runs", ["started_at"])

    op.create_table(
        "production_run_steps",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("run_id", sa.Integer(), sa.ForeignKey("production_runs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("product_step_id", sa.Integer(), sa.ForeignKey("product_steps.id", ondelete="SET NULL"), nullable=True),
        sa.Column("step_name", sa.String(), nullable=False),
        sa.Column("process_id", sa.Integer(), sa.ForeignKey("processes.id"), nullable=False),
        sa.Column("instance", sa.Integer(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("quantity_in", sa.Float(), nullable=False),
        sa.Column("quantity_out", sa.Float(), nullable=False),
        sa.Column("quantity_scrap", sa.Float(), nullable=False, server_default="0"),
        sa.Column("operator", sa.String(), nullable=True),
        sa.Column("notes", sa.String(), nullable=True),
        sa.CheckConstraint("ended_at >= started_at", name="ck_production_run_steps_dates"),
        sa.CheckConstraint("quantity_in >= 0 AND quantity_out >= 0 AND quantity_scrap >= 0", name="ck_production_run_steps_quantities"),
        sa.CheckConstraint("instance IS NULL OR instance >= 1", name="ck_production_run_steps_instance"),
    )
    op.create_index("ix_production_run_steps_run_id", "production_run_steps", ["run_id"])
    op.create_index("ix_production_run_steps_process_id", "production_run_steps", ["process_id"])


def downgrade() -> None:
    op.drop_table("production_run_steps")
    op.drop_table("production_runs")
    op.drop_constraint("ck_product_steps_duration", "product_steps", type_="check")
    op.drop_column("product_steps", "standard_duration_minutes")
    op.drop_column("product_steps", "description")
    op.drop_column("product_steps", "sequence")
    op.drop_table("product_files")
    op.drop_table("product_specs")
    op.drop_constraint("ck_products_status", "products", type_="check")
    op.drop_constraint("uq_products_reference", "products", type_="unique")
    for column in ("updated_at", "created_at", "color", "status", "revision", "unit", "standard", "material", "category", "reference"):
        op.drop_column("products", column)
