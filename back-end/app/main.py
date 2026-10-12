import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from app.config import settings
from app.core.deps import require_user
from app.database import SessionLocal, get_db
from app.api.v1.auth import router as auth_router
from app.api.v1.admin import router as admin_router
import app.crud.user as crud_user
from fastapi.middleware.cors import CORSMiddleware
from app.api.v1.products import router as products_router

from app.api.v1.processes import map_router, router as processes_router
from app.api.v1.media import router as media_router
from app.api.v1.ingest import router as ingest_router
from app.api.v1.departments import router as departments_router
from app.api.v1.maintenance import router as maintenance_router
from app.api.v1.dashboard import router as dashboard_router
from app.api.v1.exports import router as exports_router
from app.api.v1.ai import router as ai_router
from app.api.v1.simulation import router as simulation_router
# Schema is managed by Alembic: run `alembic upgrade head`

logger = logging.getLogger("uvicorn.error")

@asynccontextmanager
async def lifespan(_: FastAPI):
    # The admin account ships with the app: it is created here, never through an endpoint
    with SessionLocal() as db:
        created = crud_user.ensure_admin(db)
    if created:
        admin, generated = created
        logger.warning("Created built-in admin '%s' (must change password at first sign-in).", admin.username)
        if generated:
            logger.warning("Generated admin password (shown once): %s", generated)
    yield

app = FastAPI(title="Prominox Station Test API", lifespan=lifespan)
# Define allowed origins (Next.js default dev port is 3000)
origins = settings.ALLOWED_ORIGINS

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],  # Allows GET, POST, PUT, DELETE, etc.
    allow_headers=["*"],
)

_UNSAFE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}

@app.middleware("http")
async def reject_foreign_origins(request: Request, call_next):
    """CSRF defence on top of SameSite cookies: browsers state-changing requests must come from our front-end."""
    origin = request.headers.get("origin")
    if (
        request.method in _UNSAFE_METHODS
        and origin
        and origin not in origins
        and not request.url.path.startswith("/api/v1/ingest/")  # machine endpoint, authenticated by its URL token
    ):
        return JSONResponse(status_code=403, content={"detail": "Origin not allowed"})
    return await call_next(request)

@app.get("/")
def root():
    return {"status": "FastAPI is running"}

# Public: login/logout (auth_router guards itself) and the token-authenticated machine ingest
app.include_router(auth_router, prefix="/api/v1")
app.include_router(ingest_router, prefix="/api/v1")

# Everything else needs a logged-in user
protected = [Depends(require_user)]
app.include_router(admin_router, prefix="/api/v1")
for router in (
    processes_router, products_router, departments_router, maintenance_router,
    dashboard_router, exports_router, map_router, media_router, ai_router, simulation_router,
):
    app.include_router(router, prefix="/api/v1", dependencies=protected)
