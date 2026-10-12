from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.config import settings
from app.core.deps import clear_session_cookie, get_session_user, set_session_cookie
from app.core.security import verify_password
from app.database import get_db
from app.models.user import UserDB
from app.schemas.user import ChangePasswordRequest, LoginRequest, UpdateEmailRequest, UserResponse
import app.crud.user as crud_user

router = APIRouter(prefix="/auth", tags=["Auth"])

def _too_many_attempts() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail=f"Too many failed attempts. Try again in {settings.LOGIN_LOCKOUT_MINUTES} minutes.",
    )

def _check_current_password(db: Session, user: UserDB, password: str) -> None:
    """Re-authentication for sensitive changes; wrong guesses count towards the lockout."""
    if crud_user.is_locked(user):
        raise _too_many_attempts()
    if not verify_password(password, user.password_hash):
        crud_user.register_failed_login(user)
        db.commit()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect")

@router.post("/login", response_model=UserResponse)
def login(data: LoginRequest, response: Response, db: Session = Depends(get_db)):
    user = crud_user.get_by_username(db, data.username)
    if user and crud_user.is_locked(user):
        raise _too_many_attempts()
    if not verify_password(data.password, user.password_hash if user else None):
        if user:
            crud_user.register_failed_login(user)
            db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password")
    crud_user.register_successful_login(user)
    db.commit()
    set_session_cookie(response, user)
    return user

@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(response: Response):
    clear_session_cookie(response)

@router.get("/me", response_model=UserResponse)
def read_me(user: UserDB = Depends(get_session_user)):
    return user

@router.post("/change-password", response_model=UserResponse)
def change_password(
    data: ChangePasswordRequest,
    response: Response,
    user: UserDB = Depends(get_session_user),
    db: Session = Depends(get_db),
):
    """Works while a first-login password change is pending (that's the point of it)."""
    _check_current_password(db, user, data.current_password)
    if data.new_password == data.current_password:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="New password must differ from the current one")
    crud_user.set_password(user, data.new_password)
    db.commit()
    set_session_cookie(response, user)  # old sessions died with the token_version bump; keep this one alive
    return user

@router.patch("/me/email", response_model=UserResponse)
def update_email(data: UpdateEmailRequest, user: UserDB = Depends(get_session_user), db: Session = Depends(get_db)):
    if user.must_change_password:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="password_change_required")
    _check_current_password(db, user, data.current_password)
    try:
        crud_user.set_email(db, user, data.email)
    except crud_user.EmailTaken:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="That email is already used by another account")
    db.commit()
    return user
