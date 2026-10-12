import base64
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session

from app.core.credentials_pdf import build_credentials_pdf
from app.core.deps import require_admin
from app.database import get_db
from app.models.user import UserDB
from app.schemas.user import AuditLogPage, CreateUserRequest, Credentials, CredentialsResponse, UserResponse
import app.crud.audit as crud_audit
import app.crud.user as crud_user

# Every route here is admin-only
router = APIRouter(prefix="/admin", tags=["Admin"], dependencies=[Depends(require_admin)])

def _ip(request: Request) -> str | None:
    return request.client.host if request.client else None

def _credentials_response(user: UserDB, password: str, admin: UserDB, *, reset: bool) -> CredentialsResponse:
    pdf = build_credentials_pdf(
        name=user.name, username=user.username, password=password, issued_by=admin.name, reset=reset
    )
    return CredentialsResponse(
        user=UserResponse.model_validate(user),
        credentials=Credentials(username=user.username, password=password),
        pdf_base64=base64.b64encode(pdf).decode(),
        pdf_filename=f"credentials-{user.username}.pdf",
    )

def _target_or_404(db: Session, user_id: int) -> UserDB:
    user = crud_user.get_by_id(db, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user

def _reject_admin_target(user: UserDB, verb: str) -> None:
    if user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Administrator accounts can't be {verb} here")

@router.get("/users", response_model=list[UserResponse])
def list_users(db: Session = Depends(get_db)):
    return crud_user.list_users(db)

@router.post("/users", response_model=CredentialsResponse, status_code=status.HTTP_201_CREATED)
def create_user(data: CreateUserRequest, request: Request, admin: UserDB = Depends(require_admin), db: Session = Depends(get_db)):
    user, password = crud_user.create_user(db, data.name)
    crud_audit.record(
        db, admin, "user.create", target=user, details={"name": user.name, "role": user.role}, ip_address=_ip(request)
    )
    db.commit()
    return _credentials_response(user, password, admin, reset=False)

@router.post("/users/{user_id}/reset-password", response_model=CredentialsResponse)
def reset_user_password(user_id: int, request: Request, admin: UserDB = Depends(require_admin), db: Session = Depends(get_db)):
    user = _target_or_404(db, user_id)
    _reject_admin_target(user, "reset")
    password = crud_user.reset_password(db, user)
    crud_audit.record(db, admin, "user.reset_password", target=user, details={"name": user.name}, ip_address=_ip(request))
    db.commit()
    return _credentials_response(user, password, admin, reset=True)

@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(user_id: int, request: Request, admin: UserDB = Depends(require_admin), db: Session = Depends(get_db)):
    user = _target_or_404(db, user_id)
    _reject_admin_target(user, "deleted")
    # The journal keeps a snapshot, since the row below disappears
    crud_audit.record(
        db, admin, "user.delete", target=user,
        details={"name": user.name, "email": user.email}, ip_address=_ip(request),
    )
    db.delete(user)
    db.commit()

@router.get("/audit-log", response_model=AuditLogPage)
def read_audit_log(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    action: Optional[str] = Query(None, max_length=64),
    db: Session = Depends(get_db),
):
    items, total = crud_audit.list_entries(db, limit=limit, offset=offset, action=action)
    return AuditLogPage(items=items, total=total)
