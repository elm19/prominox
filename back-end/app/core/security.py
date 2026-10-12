import re
import secrets
import string
import unicodedata
from datetime import datetime, timedelta, timezone

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

from app.config import settings

_hasher = PasswordHasher()
# Verified against when a username doesn't exist, so unknown and known users take the same time
_DUMMY_HASH = _hasher.hash("prominox-dummy-password")

JWT_ALGORITHM = "HS256"
MIN_PASSWORD_LENGTH = 10
MAX_PASSWORD_LENGTH = 128

# --- Passwords ---
def hash_password(password: str) -> str:
    return _hasher.hash(password)

def verify_password(password: str, password_hash: str | None) -> bool:
    """Pass password_hash=None for unknown users: a dummy hash is checked so timing doesn't leak existence."""
    try:
        _hasher.verify(password_hash or _DUMMY_HASH, password)
    except (VerificationError, InvalidHashError):
        return False
    return password_hash is not None

# No 0/O/1/l/I: these passwords get read off a printed sheet and typed by hand
_LOWER = "abcdefghijkmnpqrstuvwxyz"
_UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ"
_DIGITS = "23456789"

def generate_password(length: int = 14) -> str:
    alphabet = _LOWER + _UPPER + _DIGITS
    chars = [secrets.choice(_LOWER), secrets.choice(_UPPER), secrets.choice(_DIGITS)]
    chars += [secrets.choice(alphabet) for _ in range(length - len(chars))]
    secrets.SystemRandom().shuffle(chars)
    return "".join(chars)

# --- Usernames ---
def username_base(name: str) -> str:
    """'Élodie Ben Allah' -> 'elodie.allah' (first + last word, ASCII, lower-case)."""
    ascii_name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    words = [re.sub(r"[^a-z0-9]", "", word) for word in ascii_name.lower().split()]
    words = [word for word in words if word]
    if not words:
        return "user"  # e.g. a name written entirely in Arabic script
    base = words[0] if len(words) == 1 else f"{words[0]}.{words[-1]}"
    return base[:40]

# --- Session tokens ---
def create_session_token(user_id: int, token_version: int) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "tv": token_version,
        "iat": now,
        "exp": now + timedelta(minutes=settings.SESSION_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=JWT_ALGORITHM)

def decode_session_token(token: str) -> tuple[int, int] | None:
    """Returns (user_id, token_version), or None if the token is invalid or expired."""
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[JWT_ALGORITHM], options={"require": ["exp", "sub", "tv"]}
        )
        return int(payload["sub"]), int(payload["tv"])
    except (jwt.PyJWTError, ValueError, TypeError):
        return None
