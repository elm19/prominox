"""Authentication: users and the append-only admin audit log

Revision ID: 0006
Revises: 0005
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("username", sa.String(64), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("email", sa.String(254), nullable=True),
        sa.Column("password_hash", sa.String(), nullable=False),
        sa.Column("role", sa.String(16), nullable=False, server_default="user"),
        sa.Column("must_change_password", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("token_version", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("failed_login_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("locked_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("password_changed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("username", name="uq_users_username"),
        sa.UniqueConstraint("email", name="uq_users_email"),
        sa.CheckConstraint("role in ('admin', 'user')", name="ck_users_role"),
    )
    op.create_index("ix_users_id", "users", ["id"])
    op.create_index("ix_users_username", "users", ["username"])

    op.create_table(
        "audit_log",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("actor_id", sa.Integer(), nullable=False),
        sa.Column("actor_username", sa.String(64), nullable=False),
        sa.Column("action", sa.String(64), nullable=False),
        sa.Column("target_user_id", sa.Integer(), nullable=True),
        sa.Column("target_username", sa.String(64), nullable=True),
        sa.Column("details", postgresql.JSONB(), nullable=True),
        sa.Column("ip_address", sa.String(64), nullable=True),
    )
    op.create_index("ix_audit_log_at", "audit_log", ["at"])
    op.create_index("ix_audit_log_action", "audit_log", ["action"])

    # Insert-only: the database itself refuses to change or remove journal rows
    op.execute(
        """
        CREATE FUNCTION audit_log_immutable() RETURNS trigger AS $$
        BEGIN
            RAISE EXCEPTION 'audit_log is append-only';
        END;
        $$ LANGUAGE plpgsql;
        """
    )
    op.execute(
        "CREATE TRIGGER audit_log_no_update_delete BEFORE UPDATE OR DELETE ON audit_log "
        "FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();"
    )
    op.execute(
        "CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON audit_log "
        "FOR EACH STATEMENT EXECUTE FUNCTION audit_log_immutable();"
    )


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS audit_log_no_truncate ON audit_log")
    op.execute("DROP TRIGGER IF EXISTS audit_log_no_update_delete ON audit_log")
    op.execute("DROP FUNCTION IF EXISTS audit_log_immutable()")
    op.drop_table("audit_log")
    op.drop_table("users")
