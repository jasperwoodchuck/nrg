# NRG Autonomous Grid Carbon Optimizer

Hackathon MVP with a minimal dashboard for simulated carbon-aware flexible-load scheduling. The virtual fleet never represents metered customers; all load and impact outcomes are simulated. Carbon intensity is estimated from cached Open-Meteo weather using a configurable fallback model

## Run

Requires Python 3.11+ and `uv`.

```sh
cd backend
uv sync
uv run uvicorn app.main:app
```

The API creates its SQLite database and seeds demo history on startup. OpenAPI is at `/docs`; API endpoints use `/api/v1`. In a second terminal, run `cd frontend && bun install && bun run dev`; open the Vite URL to view the dashboard.

## Configuration

Copy `backend/.env.example` to `backend/.env` only when you need to override application defaults; otherwise, no backend `.env` file is needed for local development. For local frontend development, set `VITE_API_BASE_URL=http://localhost:8000/api/v1` in `frontend/.env`. Set `FRONTEND_ORIGIN` in the backend environment to the browser origin if it differs from `http://localhost:5173`. Defaults target Kolkata, India. The location selector includes cities across all Indian states and union territories; the map picker accepts any coordinates and asks Open-Meteo to resolve their IANA timezone. You can import coordinates by pasting a Zoom Earth map URL or open the selected point in Zoom Earth. `DATABASE_URL` defaults to a local SQLite file. Optional model overrides are documented in [methodology](docs/methodology.md).

## Use Supabase Postgres

The backend can connect to a Supabase Postgres database through SQLAlchemy. Create a Supabase project, open **Connect** in its dashboard, and copy a database connection URI into the backend's `DATABASE_URL`. Use the direct connection for an IPv6-capable persistent backend, or the Session pooler connection for an IPv4-only host. Use the complete URI supplied by Supabase rather than constructing the pooler host or username yourself. Require SSL with `sslmode=require` if it is not already present in the URI. See [Supabase's connection guide](https://supabase.com/docs/guides/database/connecting-to-postgres).

The project includes Psycopg 3 and adapts `postgresql://` connection URIs for SQLAlchemy. Keep this URI private in the backend environment; the browser only talks to the API and must never receive database credentials. No Supabase frontend key, Auth, or Data API setup is needed for this database connection.

On first backend startup, SQLAlchemy creates the tables defined in `backend/app/db/models.py`. The project does not currently include a migration tool: `create_all` creates missing tables but does not update existing tables when models change. Existing local SQLite data is not copied into Supabase automatically. Keep the API on a persistent backend service because it runs a background scheduler; Vercel hosts the frontend separately. Run one API process for now because each process starts its own scheduler.

## Deploy the frontend to Vercel

This repository's Vercel project should use `frontend` as its **Root Directory**. Vercel can use the existing Bun lockfile and Vite setup; the build command is `bun run build` and the output directory is `dist`. `frontend/vercel.json` rewrites SPA routes to `index.html` so direct links and refreshes continue to load the app, following [Vercel's Vite SPA guidance](https://vercel.com/docs/frameworks/frontend/vite).

Set the only required Vercel environment variable, `VITE_API_BASE_URL`, to the public API base URL, including `/api/v1` (replace the example value in `frontend/.env.example` with your API host). Set it for each Vercel environment you will deploy. Vite embeds this value during the build, so redeploy after changing it. Do not put backend secrets in `VITE_*` variables.

Deploy the API separately on a service that supports the included `backend/Dockerfile`, with a durable database configured through `DATABASE_URL`. The API starts a background scheduler and defaults to a local SQLite file, so the static Vercel frontend deployment does not provide the persistent backend runtime this project expects. Set backend `FRONTEND_ORIGIN` to the exact production site origin so browser requests pass the current CORS allowlist. The backend currently accepts one exact origin; Vercel preview domains need corresponding CORS support/configuration before they can call the API.

## Demo

Start the API and request `/api/v1/impact/summary`, `/api/v1/forecast`, `/api/v1/schedule`, and `/api/v1/health`. The scheduler collects weather, plans pending virtual loads, marks due windows complete, refreshes impact data, and writes a template daily report. `POST /api/v1/sim/control?action=stop|start|reseed|reset-demo` is only for demo operators. With upstream access unavailable, cached weather is used, then a deterministic fallback forecast is generated.

See [docs/methodology.md](docs/methodology.md) for formulas and limitations and [docs/api.md](docs/api.md) for endpoint contracts.

## License

This project is dual-licensed under the [MIT License](LICENSE-MIT) or the [Apache License 2.0](LICENSE-APACHE), at your option.                   
