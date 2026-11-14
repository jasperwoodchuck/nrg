import logging
import json
import random
from datetime import datetime, timezone
from sqlalchemy import select
from app.core.config import settings
from app.db.database import SessionLocal
from app.db.models import AppState, Report
from app.collectors.open_meteo import collect_weather
from app.optimizer.service import optimize_pending
from app.simulator.fleet import backfill, create_loads
from app.modules.impact.engine import summarize
from app.modules.impact.service import completed_rows

logger = logging.getLogger(__name__)
_rng = random.Random(settings.random_seed)


def guarded(name, function):
    try:
        function()
        with SessionLocal() as session:
            state = session.get(AppState, f"last_success:{name}")
            if state is None:
                state = AppState(key=f"last_success:{name}", value="")
                session.add(state)
            state.value = datetime.now(timezone.utc).isoformat()
            session.commit()
    except Exception:
        logger.exception("Scheduled job %s failed", name)


def collect_job():
    with SessionLocal() as session:
        collect_weather(session)


def optimize_job():
    with SessionLocal() as session:
        optimize_pending(session)


def pipeline_job():
    guarded("collector", collect_job)
    guarded("optimizer", optimize_job)


def simulator_job():
    with SessionLocal() as session:
        if session.get(AppState, "simulator:stopped"):
            return
        create_loads(session, _rng)


def initial_backfill():
    with SessionLocal() as session:
        collect_weather(session)
        backfill(session, _rng)
        create_loads(session, _rng)
    optimize_job()


def impact_job():
    with SessionLocal() as session:
        totals = summarize(completed_rows(session))
        state = session.get(AppState, "impact:aggregate") or AppState(key="impact:aggregate", value="{}")
        state.value = json.dumps(totals)
        session.add(state)
        session.commit()


def daily_report_job():
    with SessionLocal() as session:
        totals = summarize(completed_rows(session))
        body = (f"TerraPulse report: {totals['loads_optimized']} simulated loads completed, "
                f"{totals['kwh_shifted']:.2f} kWh shifted, "
                f"{totals['saved_a_g'] / 1000:.3f} kgCO2 avoided vs typical-time baseline "
                f"({totals['saved_b_g'] / 1000:.3f} kgCO2 vs daily-average baseline).")
        session.add(Report(body=body))
        session.commit()
