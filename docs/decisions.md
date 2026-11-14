# Decisions

## Unreleased

- **PLAN.md unavailable:** The repository root did not contain the referenced PLAN.md. This implementation follows the user's detailed prompt and records no unsupported assumptions about the long-term plan.
- **Keep the existing project location:** The repository already has a Python project under `backend/`; the API package lives at `backend/app` to preserve its current uv workflow rather than adding a parallel `apps/api` project.
- **SQLite and deterministic simulation:** A local SQLite database, standard-library seeded random generator, and Open-Meteo fallback model keep the demo self-contained. External live data is optional.
- **Electricity Maps left for later:** The prompt allows this optional source to be cut. This build keeps the working Open-Meteo plus estimated fallback path and explicitly reports that Electricity Maps is skipped.
- **Electricity Maps left for later:** The prompt allows this optional source to be cut. This build keeps the working Open-Meteo plus estimated fallback path and explicitly reports that Electricity Maps is skipped.
