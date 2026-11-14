import json
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from typing import Literal
from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.exceptions import RequestValidationError
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import delete, desc, select, update
from sqlalchemy.orm import Session
from apscheduler.schedulers.background import BackgroundScheduler
from app.core.values import FACTOR_SET_VERSION
from app.core.config import settings
from app.db.database import initialize_database, get_session, SessionLocal
from app.db.models import AppState, CacheRecord, ForecastRecord, Report, ScenarioRun, VirtualLoad
from app.modules.impact.service import completed_rows, metric, range_start
from app.modules.impact.engine import summarize
from app.modules.ai.insights import (
    GEMINI_MODEL,
    GeminiInsightError,
    GeminiKeyMissingError,
    generate_energy_usage_insight,
    generate_grid_insight,
)
from app.modules.impact.mobility import estimate_weekly_mobility
from app.modules.environment.monitoring import get_air_quality, get_water_quality, water_quality_regions
from app.modules.environment.waste import build_collection_plan
from app.modules.energy.location import (
    LocationInput,
    current_location,
    persist_location,
    restore_location,
    weather_cache_key,
)
from app.modules.energy.region import resolve_indian_state
from app.modules.energy.public_grid import get_public_grid_data
from app.collectors.open_meteo import _fallback_payload, cached_payload, collect_weather
from app.optimizer.service import optimize_pending
from app.optimizer.scenario import run_scenario
from app.scheduler import jobs

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
scheduler = BackgroundScheduler(timezone="UTC")


class ScenarioInput(BaseModel):
    households: int = Field(default=30, ge=1, le=100)
    max_concurrent_loads: int = Field(default=12, ge=1, le=200)


class MobilityEstimateInput(BaseModel):
    one_way_distance_km: float = Field(gt=0, le=500, allow_inf_nan=False)
    commute_days_per_week: int = Field(ge=1, le=7)
    mode: Literal["petrol_car", "electric_car", "motorbike", "local_bus", "national_rail"]


class ApplianceUsageInput(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    rated_watts: float = Field(gt=0, le=20_000, allow_inf_nan=False)
    quantity: int = Field(ge=1, le=100)
    hours_per_day: float = Field(ge=0, le=24, allow_inf_nan=False)

    @field_validator("name")
    @classmethod
    def appliance_name_must_not_be_blank(cls, value: str) -> str:
        name = value.strip()
        if not name:
            raise ValueError("Appliance name cannot be blank")
        return name


class EnergyUsageInput(BaseModel):
    consumed_kwh: float = Field(gt=0, le=50_000, allow_inf_nan=False)
    period_days: int = Field(ge=1, le=366)
    tariff_inr_per_kwh: float | None = Field(default=None, gt=0, le=100, allow_inf_nan=False)
    language: Literal["en", "hi", "bn", "mr", "te", "ta", "gu"] = "en"
    appliances: list[ApplianceUsageInput] = Field(min_length=1, max_length=20)


@asynccontextmanager
async def lifespan(app: FastAPI):
    initialize_database()
    with SessionLocal() as session:
        restore_location(session)
    jobs.guarded("startup", jobs.initial_backfill)
    jobs.guarded("report", jobs.daily_report_job)
    scheduler.add_job(jobs.pipeline_job, "interval", minutes=15, id="collector_then_optimizer", max_instances=1, coalesce=True)
    scheduler.add_job(lambda: jobs.guarded("simulator", jobs.simulator_job), "interval", minutes=15, id="simulator", max_instances=1, coalesce=True)
    scheduler.add_job(lambda: jobs.guarded("impact", jobs.impact_job), "interval", hours=1, id="impact", max_instances=1, coalesce=True)
    scheduler.add_job(lambda: jobs.guarded("report", jobs.daily_report_job), "interval", hours=24, id="report", max_instances=1, coalesce=True)
    scheduler.start()
    yield
    scheduler.shutdown(wait=False)


app = FastAPI(title="NRG Autonomous Grid Carbon Optimizer", version="1.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=[settings.frontend_origin], allow_methods=["GET", "POST"], allow_headers=["*"])


@app.exception_handler(HTTPException)
async def http_error_handler(request, exc: HTTPException):
    return JSONResponse(status_code=exc.status_code, content={"error": {"code": "request_error", "message": str(exc.detail), "details": {}}})


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request, exc: RequestValidationError):
    return JSONResponse(status_code=422, content=jsonable_encoder({"error": {"code": "validation_error", "message": "Invalid request", "details": exc.errors()}}))


@app.get("/api/v1/location")
def get_location(session: Session = Depends(get_session)):
    cache_source = weather_cache_key(settings.latitude, settings.longitude, settings.timezone)
    mode = session.get(AppState, f"last_weather_mode:{cache_source}")
    source = mode.value if mode else "ESTIMATED"
    return {"location": current_location(), "weather_source": source, "timezone_source": source}


@app.get("/api/v1/location/region")
def get_location_region(
    latitude: float = Query(ge=-90, le=90),
    longitude: float = Query(ge=-180, le=180),
):
    return {"state": resolve_indian_state(latitude, longitude), "source": "OpenStreetMap Nominatim"}


@app.get("/api/v1/public/grid-snapshot")
def public_grid_snapshot(state: str | None = Query(default=None, min_length=2, max_length=80)):
    try:
        return get_public_grid_data(state)
    except RuntimeError as error:
        raise HTTPException(502, str(error)) from error


@app.post("/api/v1/location")
def update_location(location: LocationInput, session: Session = Depends(get_session)):
    coordinates_changed = (location.latitude, location.longitude) != (settings.latitude, settings.longitude)
    timezone_changed = location.timezone is not None and location.timezone != settings.timezone
    changed = coordinates_changed or timezone_changed
    if not changed:
        return get_location(session)

    settings.latitude = location.latitude
    settings.longitude = location.longitude
    if location.timezone is not None:
        settings.timezone = location.timezone
    session.execute(delete(ForecastRecord))
    session.execute(
        update(VirtualLoad)
        .where(VirtualLoad.status == "scheduled")
        .values(
            status="pending",
            chosen_start=None,
            optimized_intensity=None,
            baseline_intensity=None,
            daily_average_intensity=None,
        )
    )
    session.commit()

    if location.timezone is None:
        forecast_rows = collect_weather(session, timezone_auto=True)
    else:
        forecast_rows = collect_weather(session)
    persist_location(session)
    session.commit()
    optimize_pending(session)
    cache_source = weather_cache_key(settings.latitude, settings.longitude, settings.timezone)
    mode = session.get(AppState, f"last_weather_mode:{cache_source}")
    return {
        "location": current_location(),
        "weather_source": mode.value if mode else "ESTIMATED",
        "timezone_source": mode.value if mode else "ESTIMATED",
        "intensity_source": forecast_rows[0].source if forecast_rows else "ESTIMATED",
        "forecast_hours": len(forecast_rows),
    }


@app.get("/api/v1/impact/summary")
def impact_summary(range: str = Query("24h", pattern="^(24h|7d|30d)$"), session: Session = Depends(get_session)):
    data = summarize(completed_rows(session, range_start(range)))
    def m(value, unit, formula):
        return metric(value, unit, {"range": range, "loads": data["loads_optimized"], "load_source": "SIMULATED", "intensity_source": "ESTIMATED"}, formula)
    return {"range": range, "methodology": "Carbon-aware load shifting; energy consumed is unchanged. Baseline A uses typical default time; baseline B uses the daily mean intensity.", "kg_co2_saved": m(data["saved_a_g"] / 1000, "kgCO2", "sum(baseline_a - optimized)/1000"), "percent_vs_baseline_a": m(data["percent_a"], "%", "100*saved_a/baseline_a"), "percent_vs_baseline_b": m(data["percent_b"], "%", "100*saved_b/baseline_b"), "loads_optimized": m(data["loads_optimized"], "loads", "count(completed optimized loads)"), "kwh_shifted": m(data["kwh_shifted"], "kWh", "sum(load energy)")}


@app.post("/api/v1/mobility/estimate")
def mobility_estimate(request: MobilityEstimateInput):
    return estimate_weekly_mobility(
        request.one_way_distance_km,
        request.commute_days_per_week,
        request.mode,
    )


@app.post("/api/v1/energy/usage/analyze")
def analyze_energy_usage(request: EnergyUsageInput):
    appliance_rows = [
        {
            "name": appliance.name.strip(),
            "rated_watts": appliance.rated_watts,
            "quantity": appliance.quantity,
            "hours_per_day": appliance.hours_per_day,
            "estimated_kwh": round(appliance.rated_watts * appliance.quantity * appliance.hours_per_day * request.period_days / 1000, 2),
        }
        for appliance in request.appliances
    ]
    appliance_kwh = sum(row["estimated_kwh"] for row in appliance_rows)
    estimated_co2_kg = request.consumed_kwh * settings.india_grid_average_gco2_kwh / 1000
    tariff = request.tariff_inr_per_kwh
    statistics = {
        "consumed_kwh": round(request.consumed_kwh, 2),
        "period_days": request.period_days,
        "daily_average_kwh": round(request.consumed_kwh / request.period_days, 2),
        "estimated_appliance_kwh": round(appliance_kwh, 2),
        "estimated_appliance_percent_of_meter": round(appliance_kwh / request.consumed_kwh * 100, 1),
        "unaccounted_kwh": round(max(0, request.consumed_kwh - appliance_kwh), 2),
        "appliance_overage_kwh": round(max(0, appliance_kwh - request.consumed_kwh), 2),
        "estimated_co2_kg": round(estimated_co2_kg, 2),
        "emission_factor_gco2_per_kwh": settings.india_grid_average_gco2_kwh,
        "estimated_cost_inr": round(request.consumed_kwh * tariff, 2) if tariff is not None else None,
        "appliances": appliance_rows,
    }
    appliance_fit = appliance_kwh / request.consumed_kwh
    confidence_level = "high" if 0.85 <= appliance_fit <= 1.15 else "medium" if 0.65 <= appliance_fit <= 1.35 else "low"
    language_names = {"en": "English", "hi": "Hindi", "bn": "Bengali", "mr": "Marathi", "te": "Telugu", "ta": "Tamil", "gu": "Gujarati"}
    try:
        analysis = generate_energy_usage_insight(statistics, language_names[request.language])
    except GeminiKeyMissingError as error:
        raise HTTPException(503, "AI analysis is not configured. Set GEMINI_API_KEY on the backend.") from error
    except GeminiInsightError as error:
        logger.warning("Gemini energy usage analysis failed (%s)", type(error).__name__)
        raise HTTPException(502, "Gemini could not analyze this energy use. Try again later.") from error

    return {
        "source": "GEMINI",
        "model": GEMINI_MODEL,
        "analysis": analysis,
        "confidence": {"level": confidence_level, "basis": "appliance_meter_fit"},
        "statistics": statistics,
    }


@app.get("/api/v1/impact/metrics/{key}")
def impact_metric(key: str, range: str = Query("24h", pattern="^(24h|7d|30d)$"), session: Session = Depends(get_session)):
    data = summarize(completed_rows(session, range_start(range)))
    values = {"co2_saved": (data["saved_a_g"], "gCO2", "sum(kWh*(baseline_a_intensity-optimized_intensity))"), "co2_saved_baseline_b": (data["saved_b_g"], "gCO2", "sum(kWh*(daily_mean_intensity-optimized_intensity))"), "kwh_shifted": (data["kwh_shifted"], "kWh", "sum(load energy)"), "loads_optimized": (data["loads_optimized"], "loads", "count(completed loads)")}
    if key not in values:
        raise HTTPException(404, "Unknown metric key")
    value, unit, formula = values[key]
    return metric(value, unit, {"range": range, "load_count": data["loads_optimized"], "load_source": "SIMULATED", "intensity_source": "ESTIMATED"}, formula)


@app.get("/api/v1/forecast")
def forecast(session: Session = Depends(get_session)):
    now = datetime.now(timezone.utc)
    rows = list(session.scalars(select(ForecastRecord).where(ForecastRecord.timestamp >= now).order_by(ForecastRecord.timestamp).limit(72)))
    if not rows:
        rows = list(session.scalars(select(ForecastRecord).order_by(ForecastRecord.timestamp.desc()).limit(72)))
        rows.reverse()
    lowest = sorted(rows, key=lambda row: row.intensity)[:max(1, len(rows) // 8)]
    chosen = {row.timestamp for row in lowest}
    return {"source": rows[0].source if rows else "ESTIMATED", "factor_set_version": FACTOR_SET_VERSION, "forecast": [{"timestamp": row.timestamp.isoformat(), "intensity_gco2_kwh": row.intensity, "source": row.source, "weather": json.loads(row.weather_json), "low_carbon_window": row.timestamp in chosen} for row in rows]}


@app.post("/api/v1/scenario/run")
def run_optimization_scenario(request: ScenarioInput, session: Session = Depends(get_session)):
    now = datetime.now(timezone.utc)
    rows = list(session.scalars(select(ForecastRecord).where(ForecastRecord.timestamp >= now).order_by(ForecastRecord.timestamp).limit(72)))
    if not rows:
        raise HTTPException(503, "No upcoming forecast is available. Refresh the forecast and try again.")
    try:
        result = run_scenario(
            [{"timestamp": row.timestamp, "intensity": row.intensity, "source": row.source} for row in rows],
            request.households,
            request.max_concurrent_loads,
        )
    except ValueError as error:
        raise HTTPException(503, str(error)) from error
    run = ScenarioRun(
        households=request.households,
        max_concurrent_loads=request.max_concurrent_loads,
        forecast_source=result["forecast_source"],
        methodology=result["methodology"],
        summary_json=json.dumps(result["summary"], allow_nan=False),
        decisions_json=json.dumps(result["decisions"], allow_nan=False),
    )
    session.add(run)
    session.flush()
    keep_ids = select(ScenarioRun.id).order_by(desc(ScenarioRun.id)).limit(100)
    session.execute(delete(ScenarioRun).where(ScenarioRun.id.not_in(keep_ids)))
    session.commit()
    session.refresh(run)
    result["run_id"] = run.id
    result["created_at"] = run.created_at.isoformat()
    return result


@app.get("/api/v1/scenario/runs")
def scenario_runs(limit: int = Query(20, ge=1, le=100), session: Session = Depends(get_session)):
    runs = list(session.scalars(select(ScenarioRun).order_by(ScenarioRun.created_at.desc(), ScenarioRun.id.desc()).limit(limit)))
    return {
        "runs": [
            {
                "id": run.id,
                "created_at": run.created_at.isoformat(),
                "source": "SIMULATED",
                "forecast_source": run.forecast_source,
                "households": run.households,
                "max_concurrent_loads": run.max_concurrent_loads,
                "summary": json.loads(run.summary_json),
            }
            for run in runs
        ]
    }


@app.get("/api/v1/scenario/runs/{run_id}")
def scenario_run_details(run_id: int, session: Session = Depends(get_session)):
    run = session.get(ScenarioRun, run_id)
    if run is None:
        raise HTTPException(404, "Scenario run not found")
    return {
        "id": run.id,
        "created_at": run.created_at.isoformat(),
        "source": "SIMULATED",
        "forecast_source": run.forecast_source,
        "households": run.households,
        "max_concurrent_loads": run.max_concurrent_loads,
        "methodology": run.methodology,
        "summary": json.loads(run.summary_json),
        "decisions": json.loads(run.decisions_json),
    }


@app.get("/api/v1/weather")
def weather(mode: Literal["realtime", "hourly", "daily"] = Query("hourly"), session: Session = Depends(get_session)):
    """Return raw Open-Meteo weather series for the selected display mode."""
    cache_source = weather_cache_key(settings.latitude, settings.longitude, settings.timezone)
    payload = cached_payload(session, cache_source)
    if payload is None:
        collect_weather(session)
        payload = cached_payload(session, cache_source)
    source_state = session.get(AppState, f"last_weather_mode:{cache_source}")
    source = source_state.value if source_state and source_state.value in {"LIVE", "CACHED", "ESTIMATED"} else "ESTIMATED"
    cached = session.scalar(select(CacheRecord).where(CacheRecord.source == cache_source).order_by(CacheRecord.fetched_at.desc()).limit(1))
    if cached is not None and source_state is None:
        source = "CACHED"
    if payload is None:
        payload = _fallback_payload()
        source = "ESTIMATED"

    units = payload.get("hourly_units", {})
    section_name = {"realtime": "minutely_15", "hourly": "hourly", "daily": "daily"}[mode]
    section = payload.get(section_name)
    resolution = {"realtime": "15-minute", "hourly": "hourly", "daily": "daily"}[mode]
    note = None
    if mode == "realtime" and not isinstance(section, dict):
        section = payload.get("current")
        section_name = "current"
        resolution = "current"
        note = "15-minute series unavailable; showing current conditions."
        if not isinstance(section, dict):
            section = payload.get("hourly")
            section_name = "hourly"
            resolution = "hourly"
            note = "15-minute and current series unavailable; showing cached hourly data."
    elif mode == "realtime":
        note = "Open-Meteo may interpolate 15-minute values from hourly model output outside Central Europe and North America."
    if mode == "daily" and not isinstance(section, dict):
        hourly = payload.get("hourly")
        if isinstance(hourly, dict) and isinstance(hourly.get("time"), list):
            grouped: dict[str, list[int]] = {}
            for index, timestamp in enumerate(hourly["time"]):
                if isinstance(timestamp, str):
                    grouped.setdefault(timestamp[:10], []).append(index)
            daily = {"time": [], "temperature_2m_mean": [], "temperature_2m_max": [], "temperature_2m_min": [], "precipitation_sum": [], "wind_speed_80m_max": [], "shortwave_radiation_mean": []}
            for day, indices in sorted(grouped.items()):
                daily["time"].append(day)
                for output_key, input_key, operation in (
                    ("temperature_2m_mean", "temperature_2m", "mean"),
                    ("temperature_2m_max", "temperature_2m", "max"),
                    ("temperature_2m_min", "temperature_2m", "min"),
                    ("precipitation_sum", "precipitation", "sum"),
                    ("wind_speed_80m_max", "wind_speed_80m", "max"),
                    ("shortwave_radiation_mean", "shortwave_radiation", "mean"),
                ):
                    series = hourly.get(input_key, [])
                    selected = [series[index] for index in indices if isinstance(series, list) and index < len(series) and isinstance(series[index], (int, float))]
                    result = (sum(selected) / len(selected) if operation == "mean" and selected else (max(selected) if operation == "max" and selected else (min(selected) if operation == "min" and selected else sum(selected))))
                    daily[output_key].append(result if selected else None)
            section = daily
            source = "ESTIMATED"
            note = "Daily values derived from cached hourly weather because no daily series was available."
        else:
            note = "Daily series unavailable from the cached response."
            section = {"time": []}
    if not isinstance(section, dict):
        section = {"time": [], **{key: [] for key in ("temperature_2m", "precipitation", "wind_speed_80m", "shortwave_radiation")}}

    times = section.get("time", [])
    if isinstance(times, str):
        times = [times]
    if not isinstance(times, list):
        times = []
    values = []
    for index, timestamp in enumerate(times):
        if not isinstance(timestamp, str):
            continue
        fields = {
            key: column[index] if isinstance(column, list) and index < len(column) else column
            for key, column in section.items()
            if key != "time" and (isinstance(column, (list, int, float, str)) or column is None)
        }
        values.append({"timestamp": timestamp, "source": source, "values": fields})
    unit_key = f"{section_name}_units"
    response_units = payload.get(unit_key, units if mode == "hourly" else {})
    return {
        "mode": mode,
        "resolution": resolution,
        "source": source,
        "location": current_location(),
        "timezone": payload.get("timezone", settings.timezone),
        "units": response_units,
        "fetched_at": cached.fetched_at.isoformat() if cached else None,
        "note": note,
        "data": values,
    }


@app.get("/api/v1/environment/air-quality")
def air_quality(session: Session = Depends(get_session)):
    try:
        return get_air_quality(session)
    except RuntimeError as error:
        raise HTTPException(502, str(error)) from error


@app.get("/api/v1/environment/waste/collection-plan")
def waste_collection_plan():
    return build_collection_plan()


@app.get("/api/v1/environment/water-quality/regions")
def water_quality_region_list():
    try:
        return water_quality_regions()
    except RuntimeError as error:
        raise HTTPException(502, str(error)) from error


@app.get("/api/v1/environment/water-quality")
def water_quality(
    region: str = Query(..., min_length=2, max_length=80),
    radius_km: float = Query(100, ge=1, le=500),
    session: Session = Depends(get_session),
):
    try:
        return get_water_quality(session, region, settings.latitude, settings.longitude, radius_km)
    except ValueError as error:
        raise HTTPException(404, str(error)) from error
    except RuntimeError as error:
        raise HTTPException(502, str(error)) from error


@app.get("/api/v1/schedule")
def schedule(session: Session = Depends(get_session)):
    loads = list(session.scalars(select(VirtualLoad).where(VirtualLoad.chosen_start.is_not(None)).order_by(VirtualLoad.chosen_start.desc()).limit(300)))
    return {"decisions": [{"load_id": load.id, "load": load.kind, "status": load.status, "source": "SIMULATED", "baseline_time": load.baseline_at.isoformat(), "chosen_window": {"start": load.chosen_start.isoformat(), "duration_hours": load.duration_hours} if load.chosen_start else None, "saving_g": round(load.energy_kwh * ((load.baseline_intensity or 0) - (load.optimized_intensity or 0)), 2), "reason": "Lowest forecast intensity window satisfying duration and deadline."} for load in loads]}


@app.get("/api/v1/loads")
def loads(session: Session = Depends(get_session)):
    items = list(session.scalars(select(VirtualLoad).order_by(VirtualLoad.created_at.desc()).limit(500)))
    return {"source": "SIMULATED", "loads": [{"id": item.id, "kind": item.kind, "household": item.household, "energy_kwh": item.energy_kwh, "duration_hours": item.duration_hours, "status": item.status, "baseline_time": item.baseline_at.isoformat(), "deadline": item.deadline.isoformat(), "chosen_start": item.chosen_start.isoformat() if item.chosen_start else None} for item in items]}


@app.get("/api/v1/insights")
def insights(session: Session = Depends(get_session)):
    forecasts = list(session.scalars(select(ForecastRecord).order_by(ForecastRecord.timestamp)))
    done = list(session.scalars(select(VirtualLoad).where(VirtualLoad.status == "completed")))
    biggest = max(done, key=lambda load: load.energy_kwh * ((load.baseline_intensity or 0) - (load.optimized_intensity or 0)), default=None)
    tomorrow = [row for row in forecasts if row.timestamp.date() > datetime.now(timezone.utc).date()]
    cleanest = min(tomorrow, key=lambda row: row.intensity, default=None)
    spike = max(forecasts, key=lambda row: row.intensity, default=None)
    return {"source": "SIMULATED", "insights": [{"type": "biggest_saving", "load_id": biggest.id if biggest else None, "saving_g": round(biggest.energy_kwh * ((biggest.baseline_intensity or 0) - (biggest.optimized_intensity or 0)), 2) if biggest else 0}, {"type": "cleanest_window_tomorrow", "timestamp": cleanest.timestamp.isoformat() if cleanest else None, "intensity_gco2_kwh": cleanest.intensity if cleanest else None}, {"type": "highest_intensity_forecast", "timestamp": spike.timestamp.isoformat() if spike else None, "intensity_gco2_kwh": spike.intensity if spike else None}]}


@app.post("/api/v1/insights/ai")
def ai_insight(session: Session = Depends(get_session)):
    now = datetime.now(timezone.utc)
    end = now + timedelta(hours=24)
    forecast_rows = list(session.scalars(select(ForecastRecord).order_by(ForecastRecord.timestamp)))
    upcoming = []
    for row in forecast_rows:
        timestamp = row.timestamp if row.timestamp.tzinfo else row.timestamp.replace(tzinfo=timezone.utc)
        if now <= timestamp <= end:
            upcoming.append(row)

    impact = summarize(completed_rows(session))
    facts: dict[str, int | float | str | None] = {
        "completed_simulated_loads": impact["loads_optimized"],
        "energy_shifted_kwh": round(impact["kwh_shifted"], 2),
        "estimated_co2_avoided_kg": round(impact["saved_a_g"] / 1000, 3),
        "forecast_hours_next_24h": len(upcoming),
        "forecast_intensity_min_gco2_kwh": round(min((row.intensity for row in upcoming), default=0), 1) if upcoming else None,
        "forecast_intensity_max_gco2_kwh": round(max((row.intensity for row in upcoming), default=0), 1) if upcoming else None,
        "forecast_data_sources": ", ".join(sorted({row.source for row in upcoming})) or None,
    }
    sources = {row.source.upper() for row in upcoming}
    live_forecast = bool(upcoming) and sources == {"LIVE"}
    if len(upcoming) >= 18 and live_forecast and impact["loads_optimized"] >= 50:
        confidence_level = "high"
    elif len(upcoming) >= 8 and live_forecast and impact["loads_optimized"] > 0:
        confidence_level = "medium"
    else:
        confidence_level = "low"

    try:
        text = generate_grid_insight(facts)
    except GeminiKeyMissingError as error:
        raise HTTPException(503, "AI insights are not configured. Set GEMINI_API_KEY on the backend.") from error
    except GeminiInsightError as error:
        logger.warning("Gemini insight generation failed (%s)", type(error).__name__)
        raise HTTPException(502, "Gemini could not generate an insight. Try again later.") from error

    return {
        "source": "GEMINI",
        "model": GEMINI_MODEL,
        "generated_at": now.isoformat(),
        "insight": text,
        "confidence": {"level": confidence_level, "basis": "forecast_coverage"},
        "facts": facts,
    }


@app.get("/api/v1/reports/latest")
def latest_report(session: Session = Depends(get_session)):
    report = session.scalar(select(Report).order_by(Report.created_at.desc()).limit(1))
    return {"report": {"created_at": report.created_at.isoformat(), "body": report.body, "source": "SIMULATED"} if report else None}


@app.get("/api/v1/reports")
def reports(session: Session = Depends(get_session)):
    items = list(session.scalars(select(Report).order_by(Report.created_at.desc()).limit(100)))
    return {"reports": [{"created_at": row.created_at.isoformat(), "body": row.body, "source": "SIMULATED"} for row in items]}


@app.get("/api/v1/health")
def health(session: Session = Depends(get_session)):
    states = {row.key.removeprefix("last_success:"): row.value for row in session.scalars(select(AppState).where(AppState.key.like("last_success:%")))}
    latest = session.scalar(select(ForecastRecord).order_by(ForecastRecord.timestamp.desc()).limit(1))
    from app.db.models import CacheRecord
    cache_source = weather_cache_key(settings.latitude, settings.longitude, settings.timezone)
    cache = session.scalar(select(CacheRecord).where(CacheRecord.source == cache_source).order_by(CacheRecord.fetched_at.desc()).limit(1))
    cache_time = cache.fetched_at.replace(tzinfo=timezone.utc) if cache and cache.fetched_at.tzinfo is None else (cache.fetched_at if cache else None)
    source_success = session.get(AppState, f"last_source_success:{cache_source}")
    return {"status": "ok", "scheduler": "running" if scheduler.running else "stopped", "last_success": states, "data_mode": latest.source if latest else "ESTIMATED", "cache_age_seconds": max(0, (datetime.now(timezone.utc) - cache_time).total_seconds()) if cache_time else None, "cache_age_source": "CACHED" if cache_time else "ESTIMATED", "sources": {"open_meteo": source_success.value if source_success else None, "electricity_maps": "skipped unless configured; fallback active"}}


@app.post("/api/v1/sim/control")
def sim_control(action: str = Query(..., pattern="^(start|stop|reseed|reset-demo)$"), session: Session = Depends(get_session)):
    if action == "stop":
        state = session.get(AppState, "simulator:stopped") or AppState(key="simulator:stopped", value="true")
        state.value = "true"
        session.add(state)
    elif action in ("start", "reseed"):
        state = session.get(AppState, "simulator:stopped")
        if state:
            session.delete(state)
        if action == "reseed":
            from app.scheduler.jobs import _rng
            _rng.seed(settings.random_seed)
    else:
        session.query(VirtualLoad).delete()
        session.query(Report).delete()
        stopped = session.get(AppState, "simulator:stopped")
        if stopped:
            session.delete(stopped)
        session.commit()
        jobs._rng.seed(settings.random_seed)
        jobs.initial_backfill()
        return {"status": "reset", "source": "SIMULATED"}
    session.commit()
    return {"status": action, "source": "SIMULATED"}
