from datetime import datetime, timedelta, timezone

from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.core.values import FACTOR_SET_VERSION
from app.db.database import Base
from app.db.models import VirtualLoad
from app.modules.impact.service import completed_rows, metric, range_start
from app.optimizer.engine import choose_window


def make_session() -> Session:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    return Session(engine)


def test_choose_window_breaks_equal_intensity_ties_by_earliest_start():
    start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    forecast = [
        {"timestamp": start + timedelta(hours=hour), "intensity": value}
        for hour, value in enumerate([50, 200, 50, 200, 50])
    ]

    assert choose_window(forecast, start, start + timedelta(hours=5), 1) == (start, 50)


def test_choose_window_rejects_missing_hour_inside_candidate():
    start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    forecast = [
        {"timestamp": start, "intensity": 1},
        {"timestamp": start + timedelta(hours=2), "intensity": 1},
    ]

    assert choose_window(forecast, start, start + timedelta(hours=3), 3) is None


def test_completed_rows_only_includes_completed_loads_with_complete_intensity_data():
    session = make_session()
    try:
        now = datetime.now(timezone.utc)
        common = {
            "kind": "ev_charging",
            "household": 1,
            "energy_kwh": 2.0,
            "duration_hours": 1,
            "created_at": now,
            "baseline_at": now,
            "deadline": now + timedelta(hours=2),
            "chosen_start": now,
        }
        session.add_all(
            [
                VirtualLoad(**common, status="completed", optimized_intensity=100, baseline_intensity=400, daily_average_intensity=300),
                VirtualLoad(**{**common, "household": 2}, status="scheduled", optimized_intensity=100, baseline_intensity=400, daily_average_intensity=300),
                VirtualLoad(**{**common, "household": 3}, status="completed", optimized_intensity=None, baseline_intensity=400, daily_average_intensity=300),
            ]
        )
        session.commit()

        rows = completed_rows(session)

        assert len(rows) == 1
        assert rows[0]["kwh"] == 2
        assert rows[0]["saved_a_g"] == 600
        assert rows[0]["saved_b_g"] == 400
    finally:
        session.close()


def test_metric_carries_formula_version_and_rounded_value():
    result = metric(12.34567, "kWh", {"range": "24h"}, "sum(load energy)")

    assert result["value"] == 12.3457
    assert result["unit"] == "kWh"
    assert result["factor_set_version"] == FACTOR_SET_VERSION
    assert result["formula_id"] == "sum(load energy)"
    assert result["inputs"] == {"range": "24h"}
    assert result["computed_at"]


def test_range_start_uses_expected_window_lengths():
    starts = {period: range_start(period) for period in ("24h", "7d", "30d")}
    after = datetime.now(timezone.utc)

    assert timedelta(days=1) <= after - starts["24h"] <= timedelta(days=1, seconds=1)
    assert timedelta(days=7) <= after - starts["7d"] <= timedelta(days=7, seconds=1)
    assert timedelta(days=30) <= after - starts["30d"] <= timedelta(days=30, seconds=1)
    assert all(start.tzinfo is not None and start <= after for start in starts.values())
