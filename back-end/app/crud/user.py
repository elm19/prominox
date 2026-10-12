from datetime import datetime, timedelta, timezone

from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import settings
from app.core.security import generate_password, hash_password, username_base
from app.models.user import ROLE_ADMIN, ROLE_USER, UserDB

class EmailTaken(Exception):
    pass

def get_by_id(db: Session, user_id: int) -> UserDB | None:
    return db.get(UserDB, user_id)

def get_by_username(db: Session, username: str) -> UserDB | None:
    return db.query(UserDB).filter(UserDB.username == username.lower()).first()

def list_users(db: Session) -> list[UserDB]:
    return db.query(UserDB).order_by(UserDB.role, UserDB.name, UserDB.id).all()

def _unique_username(db: Session, name: str) -> str:
    base = username_base(name)
    taken = {
        row[0]
        for row in db.query(UserDB.username).filter(UserDB.username.like(f"{base}%")).all()
    }
    if base not in taken:
        return base
    suffix = 2
    while f"{base}{suffix}" in taken:
        suffix += 1
    return f"{base}{suffix}"

def create_user(db: Session, name: str) -> tuple[UserDB, str]:
    """Creates a regular user with a generated username and a one-time password. Returns (user, password)."""
    password = generate_password()
    password_hash = hash_password(password)
    for _ in range(5):  # retry if two admins race for the same username
        user = UserDB(
            username=_unique_username(db, name),
            name=name,
            password_hash=password_hash,
            role=ROLE_USER,
            must_change_password=True,
        )
        db.add(user)
        try:
            db.flush()
        except IntegrityError:
            db.rollback()
            continue
        return user, password
    raise RuntimeError("Could not allocate a unique username")

def reset_password(db: Session, user: UserDB) -> str:
    password = generate_password()
    user.password_hash = hash_password(password)
    user.must_change_password = True
    user.token_version += 1  # kicks out any session using the old password
    user.failed_login_count = 0
    user.locked_until = None
    return password

def set_password(user: UserDB, new_password: str) -> None:
    user.password_hash = hash_password(new_password)
    user.must_change_password = False
    user.token_version += 1
    user.password_changed_at = datetime.now(timezone.utc)

def set_email(db: Session, user: UserDB, email: str | None) -> None:
    email = email.strip().lower() if email else None
    if email:
        clash = db.query(UserDB).filter(func.lower(UserDB.email) == email, UserDB.id != user.id).first()
        if clash:
            raise EmailTaken()
    user.email = email
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise EmailTaken()

# --- Login throttling ---
def is_locked(user: UserDB) -> bool:
    return user.locked_until is not None and user.locked_until > datetime.now(timezone.utc)

def register_failed_login(user: UserDB) -> None:
    user.failed_login_count += 1
    if user.failed_login_count >= settings.LOGIN_MAX_ATTEMPTS:
        user.locked_until = datetime.now(timezone.utc) + timedelta(minutes=settings.LOGIN_LOCKOUT_MINUTES)
        user.failed_login_count = 0

def register_successful_login(user: UserDB) -> None:
    user.failed_login_count = 0
    user.locked_until = None
    user.last_login_at = datetime.now(timezone.utc)

# --- Built-in admin ---
def ensure_admin(db: Session) -> tuple[UserDB, str | None] | None:
    """Creates the built-in admin if none exists. Returns (admin, generated_password_or_None) when it creates one."""
    if db.query(UserDB).filter(UserDB.role == ROLE_ADMIN).first():
        return None
    password = settings.ADMIN_PASSWORD
    generated = None
    if not password:
        password = generated = generate_password(20)
    admin = UserDB(
        username=settings.ADMIN_USERNAME.strip().lower(),
        name=settings.ADMIN_NAME,
        password_hash=hash_password(password),
        role=ROLE_ADMIN,
        must_change_password=True,
    )
    db.add(admin)
    db.commit()
    return admin, generated
