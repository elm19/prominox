# Prominox

A digital-twin platform for **Prominox**, a stainless and black steel pipe manufacturer. It collects machine data, keeps a living model of the factory (departments, machines, sensors, products, routings), and turns that data into dashboards, maintenance insights, forecasts, production simulations and an AI assistant.

Built during the PFA internship at Prominox.

## What it does

| Area | Description |
|---|---|
| **Digital twin** | Departments, processes (machines, manual stations), sensors, factory map, image galleries |
| **Real-time collection (RRT)** | Each machine gets a secret ingest URL; [Node-RED](https://nodered.org) posts sensor data to it, so any machine type feeds one unified pipeline |
| **Products & production** | Product catalogue, routings (step graph), specs, files, production runs with per-step timings |
| **Maintenance** | Maintenance logs, downtime tracking, failure-risk ranking |
| **AI Lab** | Sensor forecasting, anomaly detection, maintenance-risk scoring, production-time estimates |
| **Simulation** | Discrete-event simulation (SimPy) of production orders with several dispatch strategies, including a searched optimum |
| **KPIs & exports** | KPI definitions and help pages, CSV exports of readings, logs, processes, products and runs |
| **Assistant** | Chatbot (Gemini) with selectable knowledge sources and tools that read live factory data |
| **Access control** | Cookie sessions, admin/user roles, forced password change, login lockout, audit log, credentials PDF |

## Architecture

```
 Node-RED / machines ──POST /api/v1/ingest/{token}──┐
                                                    ▼
 Browser ──► Next.js front-end ──REST (cookie)──► FastAPI back-end ──► PostgreSQL
              │  (port 3000)                       (port 8000)          (port 5432)
              └─ /api/chatbot ──► Gemini API
```

| Folder | Contents | Docs |
|---|---|---|
| [front-end/](front-end) | Next.js 16 / React 19 / Tailwind 4 / shadcn UI | [front-end/README.md](front-end/README.md) |
| [back-end/](back-end) | FastAPI, SQLAlchemy, Alembic, NumPy, SimPy | [back-end/README.md](back-end/README.md) |
| `docker-compose.yml` | PostgreSQL 16 and pgAdmin for local development | below |

`report/` (LaTeX internship report) and `presentation/` are git-ignored and not part of the application.

## Quick start

Prerequisites: Docker, Python 3.11+, Node.js 20+.

### 1. Database

Create `.env` at the repo root (it is git-ignored):

```env
POSTGRES_USER=prominox
POSTGRES_PASSWORD=change-me
POSTGRES_DB=prominox
```

```bash
docker compose up -d
```

PostgreSQL listens on `localhost:5432`; pgAdmin is on <http://localhost:5050> (default login in `docker-compose.yml`, **change it outside local dev**).

### 2. Back-end

```bash
cd back-end
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
# create back-end/.env, see back-end/README.md
alembic upgrade head
python -m scripts.seed          # optional demo data
uvicorn app.main:app --reload   # http://localhost:8000
```

### 3. Front-end

```bash
cd front-end
npm install
npm run dev                     # http://localhost:3000
```

### 4. Sign in

On first start the API creates a built-in `admin` account. If `ADMIN_PASSWORD` is not set, a random password is **logged once** in the API console. The admin must change it at first sign-in. Lost it? `python -m scripts.reset_admin_password` (from `back-end/`).

## Configuration at a glance

| Where | Variable | Purpose |
|---|---|---|
| root `.env` | `POSTGRES_USER/PASSWORD/DB` | Database container credentials |
| `back-end/.env` | `DATABASE_URL`, `SECRET_KEY` (+ optional) | API settings, see [back-end/README.md](back-end/README.md) |
| `front-end/.env.local` | `NEXT_PUBLIC_API_URL`, `GEMINI_API_KEY` | API address and chatbot key, see [front-end/README.md](front-end/README.md) |

No `.env` file is committed. Never commit secrets.

## Typical workflow

1. Define departments and processes (machines, sensors) in the app.
2. Enable RRT on a machine and copy its ingest URL into a Node-RED HTTP-request node.
3. Let data accumulate; watch live telemetry, run anomaly scans and forecasts in the AI Lab.
4. Model products and routings, log production runs, then use the simulation to compare dispatch strategies.
