from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

class AuditLogDB(Base):
    """Append-only journal of admin actions.

    No foreign keys on purpose: rows must outlive the users they mention, so ids and usernames are
    snapshots. A database trigger (see migration 0006) rejects UPDATE, DELETE and TRUNCATE.
    """
    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), index=True)
    actor_id: Mapped[int] = mapped_column(Integer, nullable=False)
    actor_username: Mapped[str] = mapped_column(String(64), nullable=False)
    action: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    target_user_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    target_username: Mapped[str | None] = mapped_column(String(64), nullable=True)
    details: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(64), nullable=True)
