from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    DATABASE_URL: str
    UPLOAD_DIR: str = "uploads"  # relative to the back-end working directory

    # --- Authentication ---
    # Signs the session tokens. Generate one with: python -c "import secrets; print(secrets.token_urlsafe(48))"
    SECRET_KEY: str
    SESSION_EXPIRE_MINUTES: int = 480
    # Cookies are Secure-only in production (HTTPS). Set COOKIE_SECURE=true there.
    COOKIE_SECURE: bool = False
    COOKIE_DOMAIN: str | None = None  # set when front-end and API live on sibling sub-domains
    # Origins allowed to call the API with credentials (also used for the CSRF origin check)
    APP_URL: str = "http://localhost:3000"  # printed on the credentials sheet
    ALLOWED_ORIGINS: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]
    LOGIN_MAX_ATTEMPTS: int = 5
    LOGIN_LOCKOUT_MINUTES: int = 15

    # The built-in admin account. It is created at start-up if no admin exists and can't be
    # created through the app. If ADMIN_PASSWORD is empty a random one is generated and logged once.
    ADMIN_USERNAME: str = "admin"
    ADMIN_NAME: str = "Administrator"
    ADMIN_PASSWORD: str = ""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @field_validator("SECRET_KEY")
    @classmethod
    def _strong_secret(cls, value: str) -> str:
        if len(value) < 32:
            raise ValueError("SECRET_KEY must be at least 32 characters")
        return value

settings = Settings()
