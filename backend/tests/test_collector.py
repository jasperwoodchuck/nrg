from datetime import datetime, timezone
import json
import httpx
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool
from app.db.database import Base
from app.db.models import CacheRecord, ForecastRecord
from app.collectors.open_meteo import collect_weather


class Response:
    def __init__(self, payload): self.payload = payload
    def raise_for_status(self): pass
    def json(self): return self.payload


class Client:
    def __init__(self, payload=None, error=None): self.payload, self.error = payload, error
    def get(self, *args, **kwargs):
        if self.error: raise self.error
        return Response(self.payload)


def fixture_session():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    return Session(engine)


def payload():
    return {"hourly": {"time": ["2026-01-01T00:00"], "temperature_2m": [25], "cloud_cover": [0], "wind_speed_80m": [2], "shortwave_radiation": [0], "precipitation": [0]}}


def test_collector_success_caches_and_builds_forecast():
    session = fixture_session()
    rows = collect_weather(session, Client(payload()))
    assert len(rows) == 1
    assert session.scalar(select(CacheRecord)) is not None
    assert rows[0].source == "ESTIMATED"


def test_collector_timeout_uses_cached_payload():
    session = fixture_session()
    session.add(CacheRecord(source="open_meteo", payload=json.dumps(payload()), fetched_at=datetime.now(timezone.utc)))
    session.commit()
    rows = collect_weather(session, Client(error=httpx.TimeoutException("timeout")))
    assert rows and rows[0].source == "CACHED"


def test_malformed_payload_falls_back_without_raising():
    session = fixture_session()
    rows = collect_weather(session, Client({"hourly": {"time": ["bad"], "temperature_2m": []}}))
    assert isinstance(rows, list)
    assert session.scalar(select(ForecastRecord)) is not None
