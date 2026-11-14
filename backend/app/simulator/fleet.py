import random
from datetime import datetime, timedelta, timezone
from sqlalchemy import select
from app.core.config import settings
from sqlalchemy.orm import Session
from app.db.models import ForecastRecord, VirtualLoad

KINDS = {
    "ev_charging": (3.0, 10.0, 3, 19, 23),
    "water_heater": (1.5, 3.5, 2, 6, 9),
    "ac_precool": (1.0, 4.0, 2, 16, 20),
    "batch_job": (0.5, 5.0, 1, 1, 6),
}


def create_loads(session: Session, rng: random.Random, per_household: int = 1, created_at: datetime | None = None) -> list[VirtualLoad]:
    now = created_at or datetime.now(timezone.utc)
    made = []
    existing = set(session.scalars(select(VirtualLoad.household).where(VirtualLoad.created_at >= now.replace(hour=0, minute=0, second=0, microsecond=0))))
    for household in range(1, 31):
        if household in existing:
            continue
        kind = rng.choice(tuple(KINDS))
        lo, hi, duration, typical_hour, deadline_hour = KINDS[kind]
        baseline = now.replace(hour=typical_hour, minute=0, second=0, microsecond=0)
        if baseline < now:
            baseline += timedelta(days=1)
        deadline = now.replace(hour=deadline_hour, minute=0, second=0, microsecond=0)
        if deadline <= now:
            deadline += timedelta(days=1)
        row = VirtualLoad(kind=kind, household=household, energy_kwh=round(rng.uniform(lo, hi), 2), duration_hours=duration, created_at=now, baseline_at=baseline, deadline=deadline, status="pending")
        session.add(row)
        made.append(row)
    session.commit()
    return made


def backfill(session: Session, rng: random.Random) -> None:
    if session.scalar(select(VirtualLoad.id).limit(1)) is not None:
        return
    forecasts = list(session.scalars(select(ForecastRecord).order_by(ForecastRecord.timestamp)))
    if not forecasts:
        return
    first = forecasts[0].timestamp
    # Seed seven days of fully simulated activity, with auditable baselines and outcomes.
    for day in range(7, 0, -1):
        base_time = first - timedelta(days=day)
        for household in range(1, 31):
            kind = rng.choice(tuple(KINDS))
            lo, hi, duration, usual_hour, _ = KINDS[kind]
            kwh = round(rng.uniform(lo, hi), 2)
            usual = base_time.replace(hour=usual_hour)
            opt = usual.replace(hour=max(0, usual_hour - 3))
            session.add(VirtualLoad(kind=kind, household=household, energy_kwh=kwh, duration_hours=duration, created_at=base_time, baseline_at=usual, deadline=usual + timedelta(hours=6), status="completed", chosen_start=opt, optimized_intensity=settings.india_grid_average_gco2_kwh * (1 - settings.solar_reduction_fraction), baseline_intensity=settings.india_grid_average_gco2_kwh, daily_average_intensity=settings.india_grid_average_gco2_kwh * (1 - settings.wind_reduction_fraction), source="SIMULATED"))
    session.commit()
