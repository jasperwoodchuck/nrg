import asyncio
import json
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import pytest
from fastapi import HTTPException
from fastapi.exceptions import RequestValidationError
from pydantic import ValidationError

from app.collectors.open_meteo import collect_weather
from app.main import app, http_error_handler, validation_error_handler, update_location, get_location
from app.core.config import settings
from app.db.models import CacheRecord, ForecastRecord, VirtualLoad, AppState
from app.modules.energy.location import LocationInput, LOCATION_STATE_KEY, restore_location, weather_cache_key
from test_collector import MockClient, MockResponse, sample_payload


def test_read_api_contracts_and_error_envelope(api_db_session):
    paths = (
        "/api/v1/location",
        "/api/v1/impact/summary?range=24h",
        "/api/v1/impact/metrics/{key}",
        "/api/v1/forecast",
        "/api/v1/weather",
        "/api/v1/schedule",
        "/api/v1/loads",
        "/api/v1/insights",
        "/api/v1/reports/latest",
        "/api/v1/reports",
        "/api/v1/health",
    )
    documented_paths = app.openapi()["paths"]
    assert all(path.split("?")[0] in documented_paths for path in paths)
    get_routes = {
        route.path: route.endpoint
        for route in app.routes
        if getattr(route, "methods", None) and "GET" in route.methods
    }
    calls = [
        ("/api/v1/location", {"session": api_db_session}),
        ("/api/v1/impact/summary", {"range": "24h", "session": api_db_session}),
        *( ("/api/v1/impact/metrics/{key}", {"key": key, "range": "24h", "session": api_db_session}) for key in ("co2_saved", "co2_saved_baseline_b", "kwh_shifted", "loads_optimized") ),
        ("/api/v1/forecast", {"session": api_db_session}),
        ("/api/v1/weather", {"mode": "hourly", "session": api_db_session}),
        ("/api/v1/schedule", {"session": api_db_session}),
        ("/api/v1/loads", {"session": api_db_session}),
        ("/api/v1/insights", {"session": api_db_session}),
        ("/api/v1/reports/latest", {"session": api_db_session}),
        ("/api/v1/reports", {"session": api_db_session}),
        ("/api/v1/health", {"session": api_db_session}),
    ]
    for path, kwargs in calls:
        assert isinstance(get_routes[path](**kwargs), dict)

    with pytest.raises(HTTPException) as missing_metric:
        get_routes["/api/v1/impact/metrics/{key}"](key="not-a-metric", range="24h", session=api_db_session)
    assert missing_metric.value.status_code == 404
    not_found = asyncio.run(http_error_handler(None, missing_metric.value))
    assert json.loads(not_found.body)["error"]["code"] == "request_error"
    validation = RequestValidationError([{"type": "missing", "loc": ("query", "range"), "msg": "Field required"}])
    bad_request = asyncio.run(validation_error_handler(None, validation))
    assert json.loads(bad_request.body)["error"]["code"] == "validation_error"
    middleware = next(item for item in app.user_middleware if item.cls.__name__ == "CORSMiddleware")
    assert "http://localhost:5173" in middleware.kwargs["allow_origins"]

def test_open_meteo_data_flows_through_forecast_endpoint(api_db_session):
    api_db_session.query(ForecastRecord).delete()
    api_db_session.commit()
    now = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    local_times = [
        (now + timedelta(hours=offset)).astimezone(ZoneInfo(settings.timezone)).strftime("%Y-%m-%dT%H:%M")
        for offset in (3, 4)
    ]
    payload = sample_payload(local_times)
    collect_weather(api_db_session, MockClient([MockResponse(payload)]))

    # Call the registered route function; HTTPX's ASGI transport hangs in this workspace's Python 3.14 stack.
    forecast_route = next(route for route in app.routes if getattr(route, "path", None) == "/api/v1/forecast")
    body = forecast_route.endpoint(session=api_db_session)

    assert len(body["forecast"]) == 2
    assert body["forecast"][0]["weather"]["temperature_2m"] == 25.0
    assert body["forecast"][0]["source"] == "ESTIMATED"
    assert "intensity_gco2_kwh" in body["forecast"][0]


def test_weather_endpoint_returns_each_cached_open_meteo_resolution(api_db_session):
    collect_weather(api_db_session, MockClient([MockResponse(sample_payload())]))
    route = next(route for route in app.routes if getattr(route, "path", None) == "/api/v1/weather")
    for mode, resolution in (("realtime", "15-minute"), ("hourly", "hourly"), ("daily", "daily")):
        result = route.endpoint(mode=mode, session=api_db_session)
        assert result["mode"] == mode
        assert result["resolution"] == resolution
        assert result["source"] == "LIVE"
        assert result["data"]
        assert result["data"][0]["values"]


def test_weather_endpoint_derives_missing_modes_from_cached_hourly_data(api_db_session):
    hourly_only = sample_payload()
    hourly_only.pop("current")
    hourly_only.pop("minutely_15")
    hourly_only.pop("daily")
    cache_source = weather_cache_key(settings.latitude, settings.longitude, settings.timezone)
    api_db_session.add(CacheRecord(source=cache_source, payload=json.dumps(hourly_only), fetched_at=datetime.now(timezone.utc)))
    previous_mode = api_db_session.get(AppState, f"last_weather_mode:{cache_source}")
    if previous_mode:
        api_db_session.delete(previous_mode)
    api_db_session.commit()
    route = next(route for route in app.routes if getattr(route, "path", None) == "/api/v1/weather")

    realtime = route.endpoint(mode="realtime", session=api_db_session)
    daily = route.endpoint(mode="daily", session=api_db_session)

    assert realtime["resolution"] == "hourly"
    assert realtime["source"] == "CACHED"
    assert realtime["data"]
    assert daily["source"] == "ESTIMATED"
    assert daily["data"][0]["values"]["temperature_2m_mean"] == 25


def test_only_location_and_simulator_control_routes_write(api_db_session):
    from app.main import sim_control
    result = sim_control(action="stop", session=api_db_session)
    assert result["status"] == "stop"
    write_routes = {route.path for route in app.routes if getattr(route, "methods", None) and route.methods.intersection({"POST", "PUT", "PATCH", "DELETE"}) and route.path.startswith("/api/v1/")}
    assert write_routes == {"/api/v1/location", "/api/v1/sim/control"}


def test_legacy_asgi_import_reexports_current_api():
    from src.app import app as legacy_app
    from app.main import app as current_app

    assert legacy_app is current_app



def test_location_change_persists_selection_and_rebuilds_forecasts(api_db_session, monkeypatch):
    original = (settings.latitude, settings.longitude, settings.timezone)
    monkeypatch.setattr(settings, "latitude", original[0])
    monkeypatch.setattr(settings, "longitude", original[1])
    monkeypatch.setattr(settings, "timezone", original[2])
    now = datetime.now(timezone.utc)
    old_forecast = ForecastRecord(timestamp=now + timedelta(hours=2), intensity=500, source="ESTIMATED", weather_json="{}")
    load = VirtualLoad(
        kind="ev_charging", household=1, energy_kwh=5, duration_hours=1,
        created_at=now, baseline_at=now, deadline=now + timedelta(hours=5),
        status="scheduled", chosen_start=now + timedelta(hours=1),
        optimized_intensity=300, baseline_intensity=500, daily_average_intensity=450,
    )
    api_db_session.add_all([old_forecast, load])
    api_db_session.commit()
    old_forecast_id = old_forecast.id

    def fake_collect(session):
        refreshed = ForecastRecord(timestamp=now + timedelta(hours=3), intensity=420, source="ESTIMATED", weather_json="{}")
        session.add(refreshed)
        session.commit()
        return [refreshed]

    monkeypatch.setattr("app.main.collect_weather", fake_collect)
    monkeypatch.setattr("app.main.optimize_pending", lambda session: None)
    selected = LocationInput(latitude=19.0760, longitude=72.8777, timezone="Asia/Kolkata")

    result = update_location(selected, api_db_session)

    assert result["location"] == {"latitude": 19.076, "longitude": 72.8777, "timezone": "Asia/Kolkata"}
    assert result["forecast_hours"] == 1
    assert api_db_session.get(ForecastRecord, old_forecast_id) is None
    api_db_session.refresh(load)
    assert load.status == "pending" and load.chosen_start is None
    state = api_db_session.get(AppState, LOCATION_STATE_KEY)
    assert state is not None and "19.076" in state.value
    assert get_location(api_db_session)["location"]["latitude"] == 19.076
    settings.latitude, settings.longitude, settings.timezone = original
    restore_location(api_db_session)
    assert settings.latitude == 19.076 and settings.longitude == 72.8777



def test_location_rejects_out_of_range_and_nonfinite_coordinates():
    with pytest.raises(ValidationError):
        LocationInput(latitude=91, longitude=0)
    with pytest.raises(ValidationError):
        LocationInput(latitude=float("nan"), longitude=0)
    with pytest.raises(ValidationError):
        LocationInput(latitude=0, longitude=0, timezone="Not/A_Timezone")
