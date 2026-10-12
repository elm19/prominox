"""process rework: manual/machine, departments as boundaries, images, user-defined typed sensors

Revision ID: 0003
Revises: 0002
"""
import sqlalchemy as sa
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- departments: map position + the three default departments ---
    op.add_column("departments", sa.Column("position_x", sa.Float(), nullable=True))
    op.add_column("departments", sa.Column("position_y", sa.Float(), nullable=True))
    op.execute("INSERT INTO departments (name) VALUES ('usinage'), ('soudage'), ('noir') ON CONFLICT (name) DO NOTHING")

    # --- location -> department: processes without a department get one named after their location ---
    op.execute(
        """
        INSERT INTO departments (name)
        SELECT DISTINCT location FROM processes
        WHERE department_id IS NULL AND location IS NOT NULL AND location <> ''
        ON CONFLICT (name) DO NOTHING
        """
    )
    op.execute(
        """
        UPDATE processes SET department_id = d.id
        FROM departments d
        WHERE processes.department_id IS NULL AND d.name = processes.location
        """
    )
    op.execute("UPDATE processes SET department_id = (SELECT id FROM departments WHERE name = 'usinage') WHERE department_id IS NULL")

    # --- processes ---
    op.add_column("processes", sa.Column("quantity", sa.Integer(), nullable=False, server_default="1"))
    op.alter_column("processes", "capacity", existing_type=sa.Float(), type_=sa.Integer(),
                    postgresql_using="GREATEST(ROUND(capacity), 0)::integer")
    op.execute("UPDATE processes SET type = 'machine'")
    op.execute("UPDATE processes SET status = CASE WHEN status IN ('active', 'warning') THEN 'active' ELSE 'inactive' END")
    op.alter_column("processes", "status", server_default="active")
    op.alter_column("processes", "department_id", existing_type=sa.Integer(), nullable=False)
    op.drop_constraint("fk_processes_department_id", "processes", type_="foreignkey")
    op.create_foreign_key("fk_processes_department_id", "processes", "departments", ["department_id"], ["id"], ondelete="RESTRICT")
    op.create_check_constraint("ck_processes_type", "processes", "type IN ('manual', 'machine')")
    op.create_check_constraint("ck_processes_status", "processes", "status IN ('active', 'inactive')")
    op.create_check_constraint("ck_processes_capacity", "processes", "capacity >= 0")
    op.create_check_constraint("ck_processes_quantity", "processes", "quantity >= 1")
    op.drop_column("processes", "location")

    # --- images ---
    op.create_table(
        "process_images",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("process_id", sa.Integer(), sa.ForeignKey("processes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("filename", sa.String(), nullable=False),
        sa.Column("stored_name", sa.String(), nullable=False, unique=True),
        sa.Column("content_type", sa.String(), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_process_images_id", "process_images", ["id"])
    op.create_index("ix_process_images_process_id", "process_images", ["process_id"])

    # --- sensors: user-defined, typed. Existing sensors only ever stored floats -> 'number' ---
    op.drop_constraint("process_sensors_process_id_sensor_key_key", "process_sensors", type_="unique")
    op.add_column("process_sensors", sa.Column("data_type", sa.String(), nullable=False, server_default="number"))
    op.alter_column("process_sensors", "data_type", server_default=None)
    op.add_column("process_sensors", sa.Column("description", sa.String(), nullable=True))
    op.drop_column("process_sensors", "sensor_key")
    op.drop_column("process_sensors", "unit")
    op.drop_column("process_sensors", "color")
    op.create_unique_constraint("uq_process_sensors_process_name", "process_sensors", ["process_id", "name"])
    op.create_check_constraint("ck_process_sensors_data_type", "process_sensors", "data_type IN ('text', 'number', 'boolean')")

    # --- readings: one typed value column per data type ---
    op.add_column("sensor_readings", sa.Column("value_number", sa.Float(), nullable=True))
    op.add_column("sensor_readings", sa.Column("value_text", sa.String(), nullable=True))
    op.add_column("sensor_readings", sa.Column("value_bool", sa.Boolean(), nullable=True))
    op.execute("UPDATE sensor_readings SET value_number = value")
    op.drop_column("sensor_readings", "value")
    op.create_check_constraint(
        "ck_sensor_readings_one_value", "sensor_readings",
        "(value_number IS NOT NULL)::int + (value_text IS NOT NULL)::int + (value_bool IS NOT NULL)::int = 1",
    )


def downgrade() -> None:
    op.drop_constraint("ck_sensor_readings_one_value", "sensor_readings", type_="check")
    op.add_column("sensor_readings", sa.Column("value", sa.Float(), nullable=True))
    op.execute("UPDATE sensor_readings SET value = COALESCE(value_number, CASE WHEN value_bool THEN 1 ELSE 0 END, 0)")
    op.alter_column("sensor_readings", "value", nullable=False)
    op.drop_column("sensor_readings", "value_bool")
    op.drop_column("sensor_readings", "value_text")
    op.drop_column("sensor_readings", "value_number")

    op.drop_constraint("ck_process_sensors_data_type", "process_sensors", type_="check")
    op.drop_constraint("uq_process_sensors_process_name", "process_sensors", type_="unique")
    op.add_column("process_sensors", sa.Column("color", sa.String(), nullable=True))
    op.add_column("process_sensors", sa.Column("unit", sa.String(), nullable=True))
    op.add_column("process_sensors", sa.Column("sensor_key", sa.String(), nullable=True))
    op.execute("UPDATE process_sensors SET sensor_key = 'sensor' || id")
    op.alter_column("process_sensors", "sensor_key", nullable=False)
    op.drop_column("process_sensors", "description")
    op.drop_column("process_sensors", "data_type")
    op.create_unique_constraint("process_sensors_process_id_sensor_key_key", "process_sensors", ["process_id", "sensor_key"])

    op.drop_table("process_images")

    op.add_column("processes", sa.Column("location", sa.String(), nullable=True))
    op.execute("UPDATE processes SET location = (SELECT name FROM departments WHERE departments.id = processes.department_id)")
    op.alter_column("processes", "location", nullable=False)
    for name in ("ck_processes_quantity", "ck_processes_capacity", "ck_processes_status", "ck_processes_type"):
        op.drop_constraint(name, "processes", type_="check")
    op.drop_constraint("fk_processes_department_id", "processes", type_="foreignkey")
    op.create_foreign_key("fk_processes_department_id", "processes", "departments", ["department_id"], ["id"], ondelete="SET NULL")
    op.alter_column("processes", "department_id", existing_type=sa.Integer(), nullable=True)
    op.alter_column("processes", "status", server_default="idle")
    op.alter_column("processes", "capacity", existing_type=sa.Integer(), type_=sa.Float())
    op.drop_column("processes", "quantity")

    op.drop_column("departments", "position_y")
    op.drop_column("departments", "position_x")
