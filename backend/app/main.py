import json
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.exceptions import RequestValidationError
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session
from apscheduler.schedulers.background import BackgroundScheduler
from app.core.values import FACTOR_SET_VERSION
from app.core.config import settings
from app.db.database import Base, engine, get_session, SessionLocal
from app.db.models import AppState, ForecastRecord, Report, VirtualLoad
from app.modules.impact.service import completed_rows, metric, range_start
from app.modules.impact.engine import summarize
from app.modules.energy.location import (
    LocationInput,
    current_location,
    persist_location,
    restore_location,
    weather_cache_key,
)
from app.collectors.open_meteo import collect_weather
from app.optimizer.service import optimize_pending
from app.scheduler import jobs

logging.basicConfig(level=logging.INFO)
scheduler = BackgroundScheduler(timezone="UTC")


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
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
    return {"location": current_location(), "weather_source": mode.value if mode else "ESTIMATED"}


@app.post("/api/v1/location")
def update_location(location: LocationInput, session: Session = Depends(get_session)):
    timezone_name = location.timezone or settings.timezone
    changed = (location.latitude, location.longitude, timezone_name) != (
        settings.latitude,
        settings.longitude,
        settings.timezone,
    )
    if not changed:
        return get_location(session)

    settings.latitude = location.latitude
    settings.longitude = location.longitude
    settings.timezone = timezone_name
    persist_location(session)
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

    forecast_rows = collect_weather(session)
    optimize_pending(session)
    cache_source = weather_cache_key(settings.latitude, settings.longitude, settings.timezone)
    mode = session.get(AppState, f"last_weather_mode:{cache_source}")
    return {
        "location": current_location(),
        "weather_source": mode.value if mode else "ESTIMATED",
        "intensity_source": forecast_rows[0].source if forecast_rows else "ESTIMATED",
        "forecast_hours": len(forecast_rows),
    }


@app.get("/api/v1/impact/summary")
def impact_summary(range: str = Query("24h", pattern="^(24h|7d|30d)$"), session: Session = Depends(get_session)):
    data = summarize(completed_rows(session, range_start(range)))
    def m(value, unit, formula):
        return metric(value, unit, {"range": range, "loads": data["loads_optimized"], "load_source": "SIMULATED", "intensity_source": "ESTIMATED"}, formula)
    return {"range": range, "methodology": "Carbon-aware load shifting; energy consumed is unchanged. Baseline A uses typical default time; baseline B uses the daily mean intensity.", "kg_co2_saved": m(data["saved_a_g"] / 1000, "kgCO2", "sum(baseline_a - optimized)/1000"), "percent_vs_baseline_a": m(data["percent_a"], "%", "100*saved_a/baseline_a"), "percent_vs_baseline_b": m(data["percent_b"], "%", "100*saved_b/baseline_b"), "loads_optimized": m(data["loads_optimized"], "loads", "count(completed optimized loads)"), "kwh_shifted": m(data["kwh_shifted"], "kWh", "sum(load energy)")}


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
