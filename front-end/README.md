# Prominox front-end

Web application for the Prominox digital twin: dashboards, factory map, machine telemetry, products and production, AI Lab, simulation and an assistant.

## Stack

Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, shadcn/ui on Base UI, Recharts (charts), React Flow (`@xyflow/react`, routing graphs), Remix Icon.

> This Next.js version has breaking changes compared with older releases. Check `node_modules/next/dist/docs/` before relying on memory (see [AGENTS.md](AGENTS.md)).

## Setup

Requires Node.js 20+ and the [back-end](../back-end/README.md) running.

```bash
npm install
npm run dev        # http://localhost:3000
```

Create `.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000   # default if omitted
GEMINI_API_KEY=...                          # server-side only, enables the chatbot
```

| Script | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and server |
| `npm run lint` | ESLint |

Without `GEMINI_API_KEY` everything works except the assistant, which answers with a configuration error.

## Pages

| Route | Description |
|---|---|
| `/` | Dashboard and KPIs |
| `/departments`, `/processes`, `/processes/[id]` | Departments, machines, sensors, live telemetry, RRT setup, images, maintenance |
| `/map` | Factory map |
| `/products`, `/products/[id]`, `/products/[id]/runs/[runId]` | Products, routing flow, specs, files, production runs (including live recording) |
| `/maintenance` | Maintenance logs |
| `/ai-lab` | Forecast, anomaly scan, maintenance risk, production estimate |
| `/simulation` | What-if production simulation |
| `/help/kpis` | KPI definitions |
| `/admin/users`, `/admin/export` | User management and CSV exports (admin) |
| `/account` | Email and password |
| `/auth/*` | Login, forgot and change password |

## Structure

```
app/
  (app)/            Authenticated pages (shared layout with sidebar)
  auth/             Public auth pages
  api/chatbot/      Server route: Gemini calls with tool use
components/         Feature folders (processes, products, ai-lab, charts, ...) and ui/ (shadcn)
lib/
  api.ts            Typed API client (snake_case to camelCase mapping)
  types.ts          Shared types
  kpi-*.ts          KPI definitions and helpers
  kb/               Chatbot knowledge: docs text, sources, tools reading live data
proxy.ts            Redirects signed-out visitors to /auth/login
```

## Authentication

The API sets an HTTP-only `prominox_session` cookie. [proxy.ts](proxy.ts) only checks that the cookie exists, to avoid showing app pages to signed-out visitors; the API validates the session on every request and is the real enforcement. The API's `ALLOWED_ORIGINS` must include the origin this app is served from.

## Assistant

The chat widget calls `/api/chatbot`, which queries Gemini with function calling. Users choose which knowledge sources are enabled (company guide, current page, factory data, products, AI Lab and simulation); tools only read data for enabled sources. The key stays on the server.
