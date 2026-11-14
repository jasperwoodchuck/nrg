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

The application defaults to a local SQLite database and `http://localhost:5173` frontend origin. For local development, set `VITE_API_BASE_URL=http://localhost:8000/api/v1` in `frontend/.env`. For Render, set the backend environment variables described below. Defaults target Kolkata, India. The location selector includes cities across all Indian states and union territories; the map picker accepts any coordinates and asks Open-Meteo to resolve their IANA timezone. You can import coordinates by pasting a Zoom Earth map URL or open the selected point in Zoom Earth. Optional model overrides are documented in [methodology](docs/methodology.md).

## Use Supabase Postgres

The backend can connect to Supabase Postgres through SQLAlchemy. For Render, copy the **Session pooler** URI from Supabase Dashboard > **Connect** into the backend's `DATABASE_URL`; Supabase documents this mode as IPv4-capable. Use the complete URI supplied by Supabase rather than constructing the pooler host or username yourself, and require SSL with `sslmode=require` if it is not already present. The direct Supabase connection requires IPv6 unless the project has the IPv4 add-on, so it can fail with “Network is unreachable” from an IPv4-only host. See [Supabase's connection guide](https://supabase.com/docs/guides/database/connecting-to-postgres).

The project includes Psycopg 3 and adapts `postgresql://` connection URIs for SQLAlchemy. Keep this URI private in the backend environment; the browser only talks to the API and must never receive database credentials. No Supabase frontend key, Auth, or Data API setup is needed for this database connection.

## Gemini AI grid insight

The Grid Insights panel has a **Generate insight** action that sends aggregated simulated-load and 24-hour forecast metrics to Gemini 3.8 Flash. It only calls Gemini when requested; the existing deterministic insights remain available without a key. The backend checks the response for usable text and returns a clear error if the key is missing or Gemini is unavailable. The API key stays on the backend.

For local development, add your key to `backend/.env` as `GEMINI_API_KEY=...` (the file is ignored by Git). For Render, add `GEMINI_API_KEY` to the backend Web Service's Environment settings; do not add it to Vercel or any `VITE_*` variable. Create a key in [Google AI Studio](https://aistudio.google.com/app/apikey). The request uses the official Gemini `generateContent` API and the stable `gemini-3.8-flash` model.

On first backend startup, SQLAlchemy creates the tables defined in `backend/app/db/models.py`. The project does not currently include a migration tool: `create_all` creates missing tables but does not update existing tables when models change. Existing local SQLite data is not copied into Supabase automatically. Keep the API on a persistent backend service because it runs a background scheduler; Vercel hosts the frontend separately. Run one API process for now because each process starts its own scheduler.

## Deploy the frontend to Vercel

This repository's Vercel project should use `frontend` as its **Root Directory**. Vercel can use the existing Bun lockfile and Vite setup; the build command is `bun run build` and the output directory is `dist`. `frontend/vercel.json` rewrites SPA routes to `index.html` so direct links and refreshes continue to load the app, following [Vercel's Vite SPA guidance](https://vercel.com/docs/frameworks/frontend/vite).

Set the only required Vercel environment variable, `VITE_API_BASE_URL`, to the public API base URL, including `/api/v1` (replace the example value in `frontend/.env.example` with your API host). Set it for each Vercel environment you will deploy. Vite embeds this value during the build, so redeploy after changing it. Do not put backend secrets in `VITE_*` variables.

Deploy the API separately on Render as a Docker web service with `backend` as its root directory and `Dockerfile` as the Dockerfile path. Set `DATABASE_URL` to the Supabase Session pooler URI from **Connect** (or, if using Render Postgres, its **Internal Database URL** when the web service is in the same region and workspace). Set `FRONTEND_ORIGIN` to the exact production Vercel origin. Render supplies `PORT`, which the container uses. The API starts a background scheduler and needs a persistent backend runtime; the static Vercel frontend deployment does not provide this. The backend currently accepts one exact origin; Vercel preview domains need corresponding CORS support/configuration before they can call the API. For Render Postgres, use its external URL only when connecting from outside Render or from a service that cannot use the same-region internal network; keep the full URL rather than replacing its hostname with an IP. See [Render's Postgres connection docs](https://render.com/docs/postgresql-creating-connecting).

## Demo

Start the API and request `/api/v1/impact/summary`, `/api/v1/forecast`, `/api/v1/schedule`, and `/api/v1/health`. The scheduler collects weather, plans pending virtual loads, marks due windows complete, refreshes impact data, and writes a template daily report. `POST /api/v1/sim/control?action=stop|start|reseed|reset-demo` is only for demo operators. With upstream access unavailable, cached weather is used, then a deterministic fallback forecast is generated.

See [docs/methodology.md](docs/methodology.md) for formulas and limitations and [docs/api.md](docs/api.md) for endpoint contracts.

## License

This project is dual-licensed under the [MIT License](LICENSE-MIT) or the [Apache License 2.0](LICENSE-APACHE), at your option.                   
