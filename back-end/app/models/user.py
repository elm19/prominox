from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

ROLE_ADMIN = "admin"
ROLE_USER = "user"

class UserDB(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[str | None] = mapped_column(String(254), unique=True, nullable=True)
    password_hash: Mapped[str] = mapped_column(String, nullable=False)
    role: Mapped[str] = mapped_column(String(16), nullable=False, default=ROLE_USER, server_default=ROLE_USER)
    # True for freshly generated / reset passwords: the user must pick their own before doing anything else
    must_change_password: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    # Bumped on every password change/reset; sessions issued before that stop working
    token_version: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    failed_login_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    password_changed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    @property
    def is_admin(self) -> bool:
        return self.role == ROLE_ADMIN
