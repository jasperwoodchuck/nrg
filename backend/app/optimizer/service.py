import json
from datetime import datetime, timezone, timedelta
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.db.models import ForecastRecord, VirtualLoad
from app.optimizer.engine import choose_window


def optimize_pending(session: Session) -> None:
    all_forecast = list(session.scalars(select(ForecastRecord).order_by(ForecastRecord.timestamp)))
    forecasts = [{"timestamp": (row.timestamp.replace(tzinfo=timezone.utc) if row.timestamp.tzinfo is None else row.timestamp), "intensity": row.intensity} for row in all_forecast]
    if not forecasts:
        return
    daily = sum(row.intensity for row in all_forecast) / len(all_forecast)
    pending = list(session.scalars(select(VirtualLoad).where(VirtualLoad.status == "pending")))
    now = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    def utc(value):
        return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value
    for load in pending:
        earliest = max(now, utc(load.created_at))
        choice = choose_window(forecasts, earliest, utc(load.deadline), load.duration_hours)
        if choice is None:
            continue
        start, intensity = choice
        row = next((item for item in all_forecast if item.timestamp == utc(load.baseline_at)), None)
        baseline = row.intensity if row else daily
        load.chosen_start = start
        load.optimized_intensity = intensity
        load.baseline_intensity = baseline
        load.daily_average_intensity = daily
        load.status = "scheduled"
    session.commit()
    for load in list(session.scalars(select(VirtualLoad).where(VirtualLoad.status == "scheduled", VirtualLoad.chosen_start <= now))):
        load.status = "completed"
    session.commit()
