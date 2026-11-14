import json
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import httpx
from sqlalchemy import select

from app.collectors import open_meteo
from app.collectors.open_meteo import URL, VARS, collect_weather
from app.modules.energy.location import weather_cache_key
from app.core.config import settings
from app.db.models import AppState, CacheRecord, ForecastRecord


class MockResponse:
    def __init__(self, body=None, json_error=None):
        self.body = body
        self.json_error = json_error

    def raise_for_status(self):
        return None

    def json(self):
        if self.json_error:
            raise self.json_error
        return self.body


class MockClient:
    def __init__(self, responses=None, error=None):
        self.responses = list(responses or [])
        self.error = error
        self.calls = []
        self.closed = False

    def get(self, url, params):
        self.calls.append((url, params))
        if self.error:
            raise self.error
        return self.responses.pop(0)

    def close(self):
        self.closed = True


def sample_payload(times=None):
    times = times or ["2026-01-01T12:00", "2026-01-01T13:00"]
    return {
        "timezone": settings.timezone,
        "hourly": {
            "time": times,
            "temperature_2m": [25.0] * len(times),
            "cloud_cover": [20.0] * len(times),
            "wind_speed_80m": [3.0] * len(times),
            "shortwave_radiation": [500.0] * len(times),
            "precipitation": [0.0] * len(times),
        },
        "current": {"time": times[0], "temperature_2m": 25.0, "cloud_cover": 20.0, "wind_speed_80m": 3.0, "shortwave_radiation": 500.0, "precipitation": 0.0},
        "minutely_15": {"time": [times[0]], "temperature_2m": [25.0], "precipitation": [0.0], "wind_speed_80m": [3.0], "shortwave_radiation": [500.0]},
        "daily": {"time": [times[0][:10]], "temperature_2m_mean": [25.0], "temperature_2m_max": [25.0], "temperature_2m_min": [25.0], "precipitation_sum": [0.0], "wind_speed_10m_max": [3.0], "shortwave_radiation_sum": [500.0]},
    }


def test_live_request_uses_open_meteo_parameters_and_caches_source(db_session):
    payload = sample_payload()
    client = MockClient([MockResponse(payload)])

    rows = collect_weather(db_session, client)

    assert len(rows) == 2
    assert client.calls == [
        (
            URL,
            {
                "latitude": settings.latitude,
                "longitude": settings.longitude,
                "hourly": VARS,
                "current": open_meteo.CURRENT_VARS,
                "minutely_15": open_meteo.MINUTELY_15_VARS,
                "daily": open_meteo.DAILY_VARS,
                "forecast_minutely_15": 96,
                "forecast_days": 3,
                "timezone": settings.timezone,
                "wind_speed_unit": "ms",
            },
        )
    ]
    cache_key = weather_cache_key(settings.latitude, settings.longitude, settings.timezone)
    cache = db_session.scalar(select(CacheRecord).where(CacheRecord.source == cache_key))
    assert cache is not None and json.loads(cache.payload) == payload
    success = db_session.get(AppState, f"last_source_success:{cache_key}")
    assert success is not None and success.value
    assert all(row.source == "ESTIMATED" for row in rows)
    assert all("wind_speed_80m" in json.loads(row.weather_json) for row in rows)


def test_live_hourly_local_time_is_normalized_to_utc(db_session):
    local = datetime(2026, 1, 1, 12, tzinfo=ZoneInfo(settings.timezone))
    rows = collect_weather(db_session, MockClient([MockResponse(sample_payload(["2026-01-01T12:00"]))]))
    assert rows[0].timestamp.replace(tzinfo=timezone.utc) == local.astimezone(timezone.utc)


def test_auto_timezone_is_forwarded_to_open_meteo_and_saved_from_response(db_session, monkeypatch):
    monkeypatch.setattr(settings, "timezone", "Asia/Kolkata")
    payload = sample_payload(["2026-01-01T12:00"])
    payload["timezone"] = "Asia/Tokyo"
    client = MockClient([MockResponse(payload)])

    rows = collect_weather(db_session, client, timezone_auto=True)

    assert client.calls[0][1]["timezone"] == "auto"
    assert settings.timezone == "Asia/Tokyo"
    assert rows


def test_timeout_uses_latest_valid_cached_response_without_raising(db_session, monkeypatch):
    monkeypatch.setattr(open_meteo.time, "sleep", lambda seconds: None)
    cached = sample_payload(["2026-01-01T12:00"])
    cache_key = weather_cache_key(settings.latitude, settings.longitude, settings.timezone)
    db_session.add(CacheRecord(source=cache_key, payload=json.dumps(cached), fetched_at=datetime.now(timezone.utc)))
    db_session.commit()
    client = MockClient(error=httpx.TimeoutException("timeout"))

    rows = collect_weather(db_session, client)

    assert len(client.calls) == 3
    assert rows and rows[0].source == "CACHED"
    assert len(list(db_session.scalars(select(ForecastRecord)))) == 1


def test_malformed_json_uses_cache_and_retries(db_session, monkeypatch):
    monkeypatch.setattr(open_meteo.time, "sleep", lambda seconds: None)
    cached = sample_payload(["2026-01-01T12:00"])
    cache_key = weather_cache_key(settings.latitude, settings.longitude, settings.timezone)
    db_session.add(CacheRecord(source=cache_key, payload=json.dumps(cached), fetched_at=datetime.now(timezone.utc)))
    db_session.commit()
    invalid_json = json.JSONDecodeError("invalid JSON", "{", 0)
    client = MockClient([MockResponse(json_error=invalid_json) for _ in range(3)])

    rows = collect_weather(db_session, client)

    assert len(client.calls) == 3
    assert rows and rows[0].source == "CACHED"


def test_malformed_response_and_corrupt_cache_use_pure_fallback(db_session, monkeypatch):
    monkeypatch.setattr(open_meteo.time, "sleep", lambda seconds: None)
    db_session.add(CacheRecord(source="open_meteo", payload="not-json", fetched_at=datetime.now(timezone.utc)))
    db_session.commit()
    malformed = {"hourly": {"time": ["bad-time"], "temperature_2m": []}}
    client = MockClient([MockResponse(malformed) for _ in range(3)])

    rows = collect_weather(db_session, client)

    assert len(client.calls) == 3
    assert len(rows) == 72
    assert all(row.source == "ESTIMATED" for row in rows)
    assert all(row.intensity >= 0 for row in rows)


def test_latest_corrupt_cache_is_skipped_for_older_valid_cache(db_session, monkeypatch):
    monkeypatch.setattr(open_meteo.time, "sleep", lambda seconds: None)
    valid = sample_payload(["2026-01-01T12:00"])
    db_session.add_all([
        CacheRecord(source=weather_cache_key(settings.latitude, settings.longitude, settings.timezone), payload=json.dumps(valid), fetched_at=datetime.now(timezone.utc) - timedelta(minutes=5)),
        CacheRecord(source=weather_cache_key(settings.latitude, settings.longitude, settings.timezone), payload="{broken", fetched_at=datetime.now(timezone.utc)),
    ])
    db_session.commit()

    rows = collect_weather(db_session, MockClient(error=httpx.ConnectError("offline")))

    assert rows and rows[0].source == "CACHED"
    assert len(rows) == 1



def test_cache_from_another_location_is_not_reused(db_session, monkeypatch):
    monkeypatch.setattr(open_meteo.time, "sleep", lambda seconds: None)
    default_key = weather_cache_key(settings.latitude, settings.longitude, settings.timezone)
    db_session.add(CacheRecord(source=default_key, payload=json.dumps(sample_payload(["2026-01-01T12:00"])), fetched_at=datetime.now(timezone.utc)))
    db_session.commit()
    monkeypatch.setattr(settings, "latitude", 19.0760)
    monkeypatch.setattr(settings, "longitude", 72.8777)

    rows = collect_weather(db_session, MockClient(error=httpx.ConnectError("offline")))

    assert len(rows) == 72
    assert all(row.source == "ESTIMATED" for row in rows)
