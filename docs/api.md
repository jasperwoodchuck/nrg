# API (v1)

Routes are read-only JSON except the location selector and demo operator control endpoints. OpenAPI is available at `/docs`. Errors use `{ "error": { "code": "request_error", "message": "...", "details": {} } }`.

- `GET /api/v1/impact/summary?range=24h|7d|30d`: headline CO2, percent vs both baselines, completed load count, shifted kWh, and methodology.
- `GET /api/v1/impact/metrics/{key}?range=...`: `co2_saved`, `co2_saved_baseline_b`, `kwh_shifted`, or `loads_optimized`; each includes `value`, `unit`, `inputs`, `factor_set_version`, `source`, `formula_id`, and `computed_at`.
- `GET /api/v1/forecast`: up to 72 forecast hours, intensity source, weather inputs, and low-carbon flags.
- `GET /api/v1/weather?mode=realtime|hourly|daily`: cached Open-Meteo current/15-minute, hourly, or daily weather series for the selected location. The response includes a source badge, resolution, timezone, units, and fetch time. `mode` defaults to `hourly`.
- `GET /api/v1/schedule`: simulated load decisions, baseline, selected window, savings, and reason.
- `GET /api/v1/loads`: virtual fleet and status.
- `GET /api/v1/insights`: biggest saving, cleanest forecast hour tomorrow, and highest forecast intensity.
- `GET /api/v1/reports/latest` and `GET /api/v1/reports`: generated report(s).
- `GET /api/v1/health`: scheduler state, last successful job timestamps, data mode, and cache age.
- `GET /api/v1/location`: current latitude, longitude, timezone, and weather source.
- `POST /api/v1/location`: update location with `{ "latitude": 19.0760, "longitude": 72.8777, "timezone": "Asia/Kolkata" }`. If `timezone` is omitted, the collector asks Open-Meteo for `timezone=auto` at the selected coordinates and saves the returned IANA zone. The backend persists this selection, isolates weather cache by location, replaces old forecasts, and reschedules pending loads. It returns the selected location, weather and timezone source badges, intensity source badge, and forecast row count.

Example location response:

```json
{
  "location": {"latitude": 19.076, "longitude": 72.8777, "timezone": "Asia/Kolkata"},
  "weather_source": "LIVE",
  "intensity_source": "ESTIMATED",
  "forecast_hours": 72
}
```

The saved location is restored at startup and takes precedence over the initial latitude/longitude environment defaults.

Example weather response:

```json
{"mode":"hourly","resolution":"hourly","source":"LIVE","location":{"latitude":22.57,"longitude":88.36,"timezone":"Asia/Kolkata"},"timezone":"Asia/Kolkata","units":{"temperature_2m":"°C"},"fetched_at":"2026-11-14T10:00:00+00:00","note":null,"data":[{"timestamp":"2026-11-14T16:00","values":{"temperature_2m":29.4,"cloud_cover":24,"wind_speed_80m":3.2,"shortwave_radiation":120,"precipitation":0}}]}
```

The realtime view requests Open-Meteo's 15-minute series. Open-Meteo notes that native 15-minute forecast data is available only in Central Europe and North America; elsewhere the service provides interpolated hourly model output. If the cached response has no 15-minute series, the endpoint returns current conditions with a `note` explaining the reduced resolution.
- `POST /api/v1/sim/control?action=start|stop|reseed|reset-demo`: demo control; the system does not need operator input to run.

Example summary shape:

```json
{
  "range": "24h",
  "methodology": "Carbon-aware load shifting; energy consumed is unchanged. Baseline A uses typical default time; baseline B uses the daily mean intensity.",
  "kg_co2_saved": {"value": 3.4, "unit": "kgCO2", "inputs": {"range": "24h", "loads": 4}, "factor_set_version": "india-grid-v1", "source": "SIMULATED", "formula_id": "sum(baseline_a - optimized)/1000", "computed_at": "2026-11-14T00:00:00+00:00"},
  "percent_vs_baseline_a": {"value": 12.0, "unit": "%", "inputs": {"range": "24h", "loads": 4}, "factor_set_version": "india-grid-v1", "source": "SIMULATED", "formula_id": "100*saved_a/baseline_a", "computed_at": "2026-11-14T00:00:00+00:00"},
  "percent_vs_baseline_b": {"value": 5.0, "unit": "%", "inputs": {"range": "24h", "loads": 4}, "factor_set_version": "india-grid-v1", "source": "SIMULATED", "formula_id": "100*saved_b/baseline_b", "computed_at": "2026-11-14T00:00:00+00:00"},
  "loads_optimized": {"value": 4, "unit": "loads", "inputs": {"range": "24h", "loads": 4}, "factor_set_version": "india-grid-v1", "source": "SIMULATED", "formula_id": "count(completed optimized loads)", "computed_at": "2026-11-14T00:00:00+00:00"},
  "kwh_shifted": {"value": 18.2, "unit": "kWh", "inputs": {"range": "24h", "loads": 4}, "factor_set_version": "india-grid-v1", "source": "SIMULATED", "formula_id": "sum(load energy)", "computed_at": "2026-11-14T00:00:00+00:00"}
}
```

Values above are illustrative response examples, not runtime measurements.
