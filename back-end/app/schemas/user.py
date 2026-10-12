from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.core.security import MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH

class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    name: str
    email: Optional[str] = None
    role: str
    must_change_password: bool
    created_at: datetime
    last_login_at: Optional[datetime] = None
    password_changed_at: Optional[datetime] = None

class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=MAX_PASSWORD_LENGTH)

    @field_validator("username")
    @classmethod
    def _normalize(cls, value: str) -> str:
        return value.strip().lower()

class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=MAX_PASSWORD_LENGTH)
    new_password: str = Field(min_length=MIN_PASSWORD_LENGTH, max_length=MAX_PASSWORD_LENGTH)

class UpdateEmailRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=MAX_PASSWORD_LENGTH)
    email: Optional[EmailStr] = None  # null removes the email

class CreateUserRequest(BaseModel):
    name: str = Field(min_length=2, max_length=120)

    @field_validator("name")
    @classmethod
    def _clean(cls, value: str) -> str:
        value = " ".join(value.split())
        if len(value) < 2:
            raise ValueError("name is too short")
        return value

class Credentials(BaseModel):
    username: str
    password: str

class CredentialsResponse(BaseModel):
    """Returned once, right after creating or resetting a user: the password is never stored in clear."""
    user: UserResponse
    credentials: Credentials
    pdf_base64: str
    pdf_filename: str

class AuditLogEntry(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    at: datetime
    actor_id: int
    actor_username: str
    action: str
    target_user_id: Optional[int] = None
    target_username: Optional[str] = None
    details: Optional[dict[str, Any]] = None
    ip_address: Optional[str] = None

class AuditLogPage(BaseModel):
    items: list[AuditLogEntry]
    total: int
