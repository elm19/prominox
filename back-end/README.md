# Prominox back-end

REST API for the Prominox digital twin. FastAPI + SQLAlchemy 2 + PostgreSQL, with Alembic migrations, NumPy-based analytics and a SimPy production simulator.

## Stack

FastAPI, Uvicorn, SQLAlchemy, Pydantic v2 / pydantic-settings, psycopg 3, Alembic, Argon2 (passwords), PyJWT (sessions), ReportLab (credentials PDF), NumPy, SimPy.

## Setup

```bash
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
```

Start PostgreSQL first (`docker compose up -d` from the repo root), then create `back-end/.env`:

```env
DATABASE_URL=postgresql+psycopg://prominox:change-me@localhost:5432/prominox
# at least 32 chars; generate: python -c "import secrets; print(secrets.token_urlsafe(48))"
SECRET_KEY=...
```

Apply the schema, seed demo data (optional) and run:

```bash
alembic upgrade head
python -m scripts.seed              # add demo data (skipped if processes already exist)
python -m scripts.seed --reset      # wipe factory data first (users and audit log are kept)
uvicorn app.main:app --reload       # http://localhost:8000, docs at /docs
```

## Configuration

All settings live in [app/config.py](app/config.py) and are read from environment variables or `.env`.

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | required | SQLAlchemy URL |
| `SECRET_KEY` | required | Signs session tokens (min. 32 chars) |
| `SESSION_EXPIRE_MINUTES` | `480` | Session lifetime |
| `COOKIE_SECURE` | `false` | Set `true` behind HTTPS |
| `COOKIE_DOMAIN` | none | For front-end and API on sibling sub-domains |
| `ALLOWED_ORIGINS` | `localhost:3000`, `127.0.0.1:3000` | CORS and CSRF origin check (JSON list) |
| `APP_URL` | `http://localhost:3000` | Printed on the credentials sheet |
| `LOGIN_MAX_ATTEMPTS` / `LOGIN_LOCKOUT_MINUTES` | `5` / `15` | Brute-force protection |
| `ADMIN_USERNAME` / `ADMIN_NAME` | `admin` / `Administrator` | Built-in admin |
| `ADMIN_PASSWORD` | empty | If empty, a random password is generated and logged once |
| `UPLOAD_DIR` | `uploads` | Uploaded images and product files |

## Layout

```
app/
  main.py          App, CORS, CSRF origin check, router wiring
  config.py        Settings
  database.py     Engine, session, Base
  core/            Auth dependencies, password/session security, credentials PDF
  models/          SQLAlchemy models
  schemas/         Pydantic request/response models
  crud/            Database access and business rules
  api/v1/          Routers (one file per domain)
  ai/              forecast, anomaly, maintenance risk, production estimate
  simulation/      SimPy engine and dispatch strategies
alembic/           Migrations (0001 baseline to 0006 auth)
scripts/           seed.py, reset_admin_password.py
uploads/           Stored files (git-ignored)
```

## API overview

All routes are under `/api/v1`. Interactive docs: `/docs`.

| Router | Purpose |
|---|---|
| `auth` | Login, logout, current user, change password, email (public except the session checks) |
| `admin` | User management (admin only) |
| `processes`, `departments` | Machines, sensors, readings, factory map |
| `products` | Products, routings/steps, specs, files, production runs |
| `maintenance` | Maintenance logs |
| `dashboard` | KPIs and aggregates |
| `media` | Process images |
| `exports` | CSV exports (readings, logs, processes, products, runs) |
| `ai` | `/forecast`, `/anomalies`, `/maintenance-risk`, `/production-estimate`, `/sensor-summary` |
| `simulation` | `/catalog`, `/run` |
| `ingest` | `POST /ingest/{token}`, machine data endpoint for Node-RED |

Every router except `auth` and `ingest` requires a signed-in user.

### Real-time ingestion (RRT)

Enable RRT on a machine (type `machine`) to generate a secret token. Node-RED then posts readings to `/api/v1/ingest/{token}`:

- up to 1000 rows per request; the timestamp key may be `timestamp`, `time` or `ts`
- invalid values reject the whole request (422, nothing stored) and the error is recorded on the machine
- the token can be rotated, and RRT disabled, from the machine page; treat the URL as a secret

## Security notes

- Sessions are HTTP-only cookies (`prominox_session`); passwords are hashed with Argon2.
- State-changing requests from a foreign `Origin` are rejected (CSRF defence on top of SameSite); the ingest route is exempt and token-authenticated.
- The admin account is created at start-up, never through an endpoint. Recover it with:
  ```bash
  python -m scripts.reset_admin_password
  ```
- Sensitive actions are written to the audit log.

## Database migrations

```bash
alembic upgrade head                          # apply
alembic revision --autogenerate -m "message"  # create after changing models
alembic downgrade -1                          # roll back one step
```

The schema is managed only by Alembic; the app never creates tables itself.

## Analytics and simulation

- **Forecast**: several small models compete on a hold-out; the most accurate is used.
- **Anomalies**: robust z-score against a rolling median; no labels or training needed.
- **Simulation**: discrete-event model of orders flowing through product routings with dispatch rules (FIFO, SPT, LPT, proportional, sequence, most work remaining) and an `optimized` search.
