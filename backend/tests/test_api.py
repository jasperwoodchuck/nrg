import asyncio
import json
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import pytest
from fastapi import HTTPException
from fastapi.exceptions import RequestValidationError

from app.collectors.open_meteo import collect_weather
from app.main import app, http_error_handler, validation_error_handler
from app.core.config import settings
from test_collector import MockClient, MockResponse, sample_payload


def test_read_api_contracts_and_error_envelope(api_db_session):
    paths = (
        "/api/v1/impact/summary?range=24h",
        "/api/v1/impact/metrics/{key}",
        "/api/v1/forecast",
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
        ("/api/v1/impact/summary", {"range": "24h", "session": api_db_session}),
        *( ("/api/v1/impact/metrics/{key}", {"key": key, "range": "24h", "session": api_db_session}) for key in ("co2_saved", "co2_saved_baseline_b", "kwh_shifted", "loads_optimized") ),
        ("/api/v1/forecast", {"session": api_db_session}),
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


def test_simulator_control_is_the_only_write_route(api_db_session):
    from app.main import sim_control
    result = sim_control(action="stop", session=api_db_session)
    assert result["status"] == "stop"
    write_routes = {route.path for route in app.routes if getattr(route, "methods", None) and route.methods.intersection({"POST", "PUT", "PATCH", "DELETE"}) and route.path.startswith("/api/v1/")}
    assert write_routes == {"/api/v1/sim/control"}


def test_legacy_asgi_import_reexports_current_api():
    from src.app import app as legacy_app
    from app.main import app as current_app

    assert legacy_app is current_app
