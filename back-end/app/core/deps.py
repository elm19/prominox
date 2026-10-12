from fastapi import Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.config import settings
from app.core.security import create_session_token, decode_session_token
from app.database import get_db
from app.models.user import UserDB

SESSION_COOKIE = "prominox_session"
PASSWORD_CHANGE_REQUIRED = "password_change_required"

def set_session_cookie(response: Response, user: UserDB) -> None:
    response.set_cookie(
        SESSION_COOKIE,
        create_session_token(user.id, user.token_version),
        max_age=settings.SESSION_EXPIRE_MINUTES * 60,
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite="lax",
        domain=settings.COOKIE_DOMAIN,
        path="/",
    )

def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(SESSION_COOKIE, domain=settings.COOKIE_DOMAIN, path="/")

def get_session_user(request: Request, db: Session = Depends(get_db)) -> UserDB:
    """The logged-in user, even if they still have to change their password."""
    unauthenticated = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated",
        headers={"WWW-Authenticate": "Cookie"},
    )
    token = request.cookies.get(SESSION_COOKIE)
    decoded = decode_session_token(token) if token else None
    if decoded is None:
        raise unauthenticated
    user_id, token_version = decoded
    user = db.get(UserDB, user_id)
    # token_version changes on password change/reset, which logs every older session out
    if user is None or user.token_version != token_version:
        raise unauthenticated
    return user

def require_user(user: UserDB = Depends(get_session_user)) -> UserDB:
    """Gate for every business endpoint: logged in AND past the forced first-login password change."""
    if user.must_change_password:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=PASSWORD_CHANGE_REQUIRED)
    return user

def require_admin(user: UserDB = Depends(require_user)) -> UserDB:
    if not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Administrator access required")
    return user
