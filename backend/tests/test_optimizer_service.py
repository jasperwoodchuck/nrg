from datetime import datetime, timedelta, timezone

from app.db.models import ForecastRecord, VirtualLoad
from app.optimizer.service import optimize_pending
from app.optimizer.scenario import AVERAGE_HOUSEHOLD_DAILY_KWH, run_scenario


def test_optimizer_handles_sqlite_naive_datetimes_and_schedules_within_deadline(db_session):
    start = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0) + timedelta(hours=1)
    for offset, intensity in enumerate((500.0, 300.0, 250.0, 400.0)):
        db_session.add(
            ForecastRecord(
                timestamp=start + timedelta(hours=offset),
                intensity=intensity,
                source="ESTIMATED",
                weather_json="{}",
            )
        )
    load = VirtualLoad(
        kind="batch_job",
        household=1,
        energy_kwh=2.0,
        duration_hours=1,
        created_at=datetime.now(timezone.utc),
        baseline_at=start,
        deadline=start + timedelta(hours=3),
        status="pending",
    )
    db_session.add(load)
    db_session.commit()

    optimize_pending(db_session)
    db_session.refresh(load)

    assert load.status == "scheduled"
    assert load.chosen_start is not None
    chosen = load.chosen_start.replace(tzinfo=timezone.utc) if load.chosen_start.tzinfo is None else load.chosen_start
    deadline = load.deadline.replace(tzinfo=timezone.utc) if load.deadline.tzinfo is None else load.deadline
    assert chosen <= start + timedelta(hours=2)
    assert chosen + timedelta(hours=load.duration_hours) <= deadline
    assert load.optimized_intensity == 250.0


def test_scenario_scales_flexible_load_profile_to_published_household_average():
    start = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    forecasts = [
        {"timestamp": start + timedelta(hours=hour), "intensity": 300.0 + hour, "source": "ESTIMATED"}
        for hour in range(48)
    ]

    result = run_scenario(forecasts, households=3)

    assert result["summary"]["energy_consumed_kwh"] == round(AVERAGE_HOUSEHOLD_DAILY_KWH * 0.19 * 3, 2)
    assert {row["load"] for row in result["decisions"]} == {"ac_precool", "washing_machine"}
    assert "1,805 kWh per household-year" in result["methodology"]
    assert "Upper-bound estimate" in result["methodology"]
    assert "11%, washing machines 8%" in result["methodology"]
