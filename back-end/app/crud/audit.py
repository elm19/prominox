from typing import Any

from sqlalchemy.orm import Session

from app.models.audit_log import AuditLogDB
from app.models.user import UserDB

# The journal is insert-only: this module deliberately has no update or delete.
def record(
    db: Session,
    actor: UserDB,
    action: str,
    *,
    target: UserDB | None = None,
    details: dict[str, Any] | None = None,
    ip_address: str | None = None,
) -> None:
    """Adds a journal row to the current transaction (the caller commits, so action and log are atomic)."""
    db.add(
        AuditLogDB(
            actor_id=actor.id,
            actor_username=actor.username,
            action=action,
            target_user_id=target.id if target else None,
            target_username=target.username if target else None,
            details=details,
            ip_address=ip_address,
        )
    )

def list_entries(db: Session, *, limit: int, offset: int, action: str | None = None) -> tuple[list[AuditLogDB], int]:
    query = db.query(AuditLogDB)
    if action:
        query = query.filter(AuditLogDB.action == action)
    total = query.count()
    items = query.order_by(AuditLogDB.at.desc(), AuditLogDB.id.desc()).offset(offset).limit(limit).all()
    return items, total
