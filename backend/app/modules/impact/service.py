from datetime import datetime, timedelta, timezone
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.core.values import FACTOR_SET_VERSION
from app.db.models import VirtualLoad
from app.modules.impact.engine import calculate_load, summarize


def completed_rows(session: Session, since: datetime | None = None) -> list[dict]:
    query = select(VirtualLoad).where(VirtualLoad.status == "completed", VirtualLoad.chosen_start.is_not(None))
    if since:
        query = query.where(VirtualLoad.chosen_start >= since)
    result = []
    for load in session.scalars(query):
        if load.optimized_intensity is None or load.baseline_intensity is None or load.daily_average_intensity is None:
            continue
        result.append({"kwh": load.energy_kwh, **calculate_load(load.energy_kwh, load.baseline_intensity, load.daily_average_intensity, load.optimized_intensity)})
    return result


def metric(value: float, unit: str, inputs: dict, formula_id: str, source: str = "SIMULATED") -> dict:
    return {"value": round(value, 4), "unit": unit, "inputs": inputs, "factor_set_version": FACTOR_SET_VERSION, "source": source, "formula_id": formula_id, "computed_at": datetime.now(timezone.utc).isoformat()}


def range_start(value: str) -> datetime:
    days = {"24h": 1, "7d": 7, "30d": 30}[value]
    return datetime.now(timezone.utc) - timedelta(days=days)
