import random
from datetime import datetime, timedelta, timezone

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.db.database import Base
from app.db.models import ForecastRecord, VirtualLoad
from app.simulator.fleet import backfill, create_loads


def make_session() -> Session:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    return Session(engine)


def test_create_loads_is_deterministic_and_assigns_valid_windows():
    now = datetime(2026, 1, 1, 12, tzinfo=timezone.utc)
    first_session = make_session()
    second_session = make_session()
    try:
        first = create_loads(first_session, random.Random(17), created_at=now)
        second = create_loads(second_session, random.Random(17), created_at=now)

        assert len(first) == len(second) == 30
        assert [(row.household, row.kind, row.energy_kwh, row.duration_hours) for row in first] == [
            (row.household, row.kind, row.energy_kwh, row.duration_hours) for row in second
        ]
        assert {row.household for row in first} == set(range(1, 31))
        assert all(row.status == "pending" for row in first)
        assert all(row.baseline_at < row.deadline for row in first)
        assert all(row.deadline - row.baseline_at >= timedelta(hours=row.duration_hours) for row in first)
    finally:
        first_session.close()
        second_session.close()


def test_create_loads_skips_households_already_created_that_day():
    session = make_session()
    try:
        now = datetime(2026, 1, 1, 12, tzinfo=timezone.utc)
        original = create_loads(session, random.Random(1), created_at=now)
        repeated = create_loads(session, random.Random(2), created_at=now + timedelta(hours=2))

        assert len(original) == 30
        assert repeated == []
        assert len(list(session.scalars(select(VirtualLoad)))) == 30
    finally:
        session.close()


def test_backfill_is_noop_without_forecasts_and_idempotent_with_forecast():
    session = make_session()
    try:
        backfill(session, random.Random(1))
        assert list(session.scalars(select(VirtualLoad))) == []

        first_forecast = datetime(2026, 1, 8, tzinfo=timezone.utc)
        session.add(ForecastRecord(timestamp=first_forecast, intensity=400, source="ESTIMATED"))
        session.commit()
        backfill(session, random.Random(1))
        rows = list(session.scalars(select(VirtualLoad)))
        assert len(rows) == 7 * 30
        assert all(row.status == "completed" for row in rows)
        assert all(row.chosen_start is not None for row in rows)

        backfill(session, random.Random(2))
        assert len(list(session.scalars(select(VirtualLoad)))) == len(rows)
    finally:
        session.close()
