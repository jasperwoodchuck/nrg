# TerraPulse Autonomous Grid Carbon Optimizer

Backend-only hackathon MVP for simulated carbon-aware flexible-load scheduling. The virtual fleet never represents metered customers; all load and impact outcomes are simulated. Carbon intensity is estimated from cached Open-Meteo weather using a configurable fallback model.

## Run

Requires Python 3.11+ and `uv`.

```sh
cd backend
uv sync
uv run uvicorn app.main:app
```

Or from the repository root, run `make run`. The API creates its SQLite database and seeds demo history on startup. OpenAPI is at `/docs`; API endpoints use `/api/v1`.

## Configuration

Copy `.env.example` to `backend/.env` (or export variables in the process environment). Defaults target Kolkata, India. `DATABASE_URL` defaults to a local SQLite file. The India grid anchor and fallback model coefficients can be adjusted using the documented variables. `ELECTRICITY_MAPS_API_KEY` is reserved for optional integration; this MVP currently relies on the fallback intensity model.

## Demo

Start the API and request `/api/v1/impact/summary`, `/api/v1/forecast`, `/api/v1/schedule`, and `/api/v1/health`. The scheduler collects weather, plans pending virtual loads, marks due windows complete, refreshes impact data, and writes a template daily report. `POST /api/v1/sim/control?action=stop|start|reseed|reset-demo` is only for demo operators. With upstream access unavailable, cached weather is used, then a deterministic fallback forecast is generated.

See [docs/methodology.md](docs/methodology.md) for formulas and limitations and [docs/api.md](docs/api.md) for endpoint contracts.

## License

This project is dual-licensed under the [MIT License](LICENSE-MIT) or the [Apache License 2.0](LICENSE-APACHE), at your option.

## License

This project is dual-licensed under the [MIT License](LICENSE-MIT) or the [Apache License 2.0](LICENSE-APACHE), at your option.
