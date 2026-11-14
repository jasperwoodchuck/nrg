import json
import logging
import math
import time
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import AppState, CacheRecord, ForecastRecord
from app.forecast.model import estimate_intensity
from app.modules.energy.location import weather_cache_key

logger = logging.getLogger(__name__)
URL = "https://api.open-meteo.com/v1/forecast"
VARS = "temperature_2m,cloud_cover,wind_speed_80m,shortwave_radiation,precipitation"
WEATHER_KEYS = tuple(VARS.split(","))
CURRENT_VARS = VARS
MINUTELY_15_VARS = "temperature_2m,precipitation,wind_speed_80m,shortwave_radiation"
DAILY_VARS = "temperature_2m_mean,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,shortwave_radiation_sum"


def _validate_payload(payload: object) -> dict:
    if not isinstance(payload, dict):
        raise ValueError("Open-Meteo response must be a JSON object")
    hourly = payload.get("hourly")
    if not isinstance(hourly, dict):
        raise ValueError("Open-Meteo response is missing hourly data")
    times = hourly.get("time")
    if not isinstance(times, list) or not times:
        raise ValueError("Open-Meteo response contains no hourly timestamps")
    timezone_name = payload.get("timezone", settings.timezone)
    if not isinstance(timezone_name, str):
        raise ValueError("Open-Meteo response timezone must be a string")
    local_zone = ZoneInfo(timezone_name)
    for value in times:
        if not isinstance(value, str):
            raise ValueError("Open-Meteo timestamp must be a string")
        parsed = datetime.fromisoformat(value)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=local_zone)
    for key in WEATHER_KEYS:
        values = hourly.get(key)
        if not isinstance(values, list) or len(values) != len(times):
            raise ValueError(f"Malformed Open-Meteo series: {key}")
        for value in values:
            if value is None:
                continue
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
                raise ValueError(f"Open-Meteo series contains a non-numeric value: {key}")
    return payload


def cached_payload(session: Session, source: str) -> dict | None:
    records = session.scalars(
        select(CacheRecord)
        .where(CacheRecord.source == source)
        .order_by(CacheRecord.fetched_at.desc())
        .limit(10)
    )
    for item in records:
        try:
            return _validate_payload(json.loads(item.payload))
        except (ValueError, TypeError, json.JSONDecodeError, ZoneInfoNotFoundError):
            logger.warning("Ignoring malformed cached %s response", source)
    return None


def _fallback_payload() -> dict:
    now = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    times = [(now + timedelta(hours=index)).isoformat() for index in range(72)]
    quarter_hours = [(now + timedelta(minutes=15 * index)).isoformat() for index in range(96)]
    return {
        "hourly": {
            "time": times,
            "temperature_2m": [25.0] * len(times),
            "cloud_cover": [50.0] * len(times),
            "wind_speed_80m": [3.0] * len(times),
            "shortwave_radiation": [0.0] * len(times),
            "precipitation": [0.0] * len(times),
        },
        "timezone": settings.timezone,
        "current": {"time": now.isoformat(), "temperature_2m": 25.0, "cloud_cover": 50.0, "wind_speed_80m": 3.0, "shortwave_radiation": 0.0, "precipitation": 0.0},
        "minutely_15": {"time": quarter_hours, "temperature_2m": [25.0] * 96, "precipitation": [0.0] * 96, "wind_speed_80m": [3.0] * 96, "shortwave_radiation": [0.0] * 96},
        "daily": {"time": [now.date().isoformat()], "temperature_2m_mean": [25.0], "temperature_2m_max": [25.0], "temperature_2m_min": [25.0], "precipitation_sum": [0.0], "wind_speed_10m_max": [3.0], "shortwave_radiation_sum": [0.0]},
    }


def _request_payload(client: httpx.Client) -> dict:
    params = {
        "latitude": settings.latitude,
        "longitude": settings.longitude,
        "hourly": VARS,
        "current": CURRENT_VARS,
        "minutely_15": MINUTELY_15_VARS,
        "daily": DAILY_VARS,
        "forecast_minutely_15": 96,
        "forecast_days": 3,
        "timezone": settings.timezone,
        "wind_speed_unit": "ms",
    }
    last_error: Exception | None = None
    for attempt in range(3):
        try:
            response = client.get(URL, params=params)
            response.raise_for_status()
            return _validate_payload(response.json())
        except Exception as exc:
            last_error = exc
            if attempt < 2:
                time.sleep(0.25 * (2**attempt))
    raise last_error or RuntimeError("Open-Meteo is unavailable")


def collect_weather(session: Session, client: httpx.Client | None = None) -> list[ForecastRecord]:
    owns_client = client is None
    http_client = client or httpx.Client(timeout=3.0)
    payload: dict | None = None
    try:
        payload = _request_payload(http_client)
        response_timezone = payload.get("timezone")
        if isinstance(response_timezone, str):
            settings.timezone = response_timezone
        cache_source = weather_cache_key(settings.latitude, settings.longitude, settings.timezone)
        fetched_at = datetime.now(timezone.utc)
        session.add(CacheRecord(source=cache_source, payload=json.dumps(payload, allow_nan=False), fetched_at=fetched_at))
        success = session.get(AppState, f"last_source_success:{cache_source}")
        if success is None:
            success = AppState(key=f"last_source_success:{cache_source}", value="")
        success.value = fetched_at.isoformat()
        session.add(success)
        source = "LIVE"
        mode_key = f"last_weather_mode:{cache_source}"
        mode_state = session.get(AppState, mode_key) or AppState(key=mode_key, value="")
        mode_state.value = source
        session.add(mode_state)
        session.commit()
    except Exception as exc:
        logger.warning("Weather collection failed; using cached data or model fallback: %s", exc)
        session.rollback()
        cache_source = weather_cache_key(settings.latitude, settings.longitude, settings.timezone)
        payload = cached_payload(session, cache_source)
        if payload is None and (settings.latitude, settings.longitude) == (22.57, 88.36):
            payload = cached_payload(session, "open_meteo")
        if payload is not None and isinstance(payload.get("timezone"), str):
            settings.timezone = payload["timezone"]
        source = "CACHED" if payload is not None else "ESTIMATED"
    finally:
        if owns_client:
            http_client.close()

    if payload is None:
        payload = _fallback_payload()
    hourly = payload["hourly"]
    rows: list[ForecastRecord] = []
    timezone_name = payload.get("timezone", settings.timezone)
    if not isinstance(timezone_name, str):
        raise ValueError("Open-Meteo response timezone must be a string")
    local_zone = ZoneInfo(timezone_name)
    for index, time_value in enumerate(hourly["time"]):
        at = datetime.fromisoformat(time_value)
        if at.tzinfo is None:
            at = at.replace(tzinfo=local_zone)
        at = at.astimezone(timezone.utc)
        weather = {key: hourly[key][index] for key in WEATHER_KEYS}
        intensity = estimate_intensity(at, weather)
        intensity_source = "CACHED" if source == "CACHED" else "ESTIMATED"
        row = session.scalar(select(ForecastRecord).where(ForecastRecord.timestamp == at))
        if row is None:
            row = ForecastRecord(timestamp=at, intensity=intensity, source=intensity_source, weather_json=json.dumps(weather, allow_nan=False))
            session.add(row)
        else:
            row.intensity = intensity
            row.source = intensity_source
            row.weather_json = json.dumps(weather, allow_nan=False)
        rows.append(row)
    if source != "LIVE":
        cache_source = weather_cache_key(settings.latitude, settings.longitude, settings.timezone)
        mode_key = f"last_weather_mode:{cache_source}"
        mode_state = session.get(AppState, mode_key) or AppState(key=mode_key, value="")
        mode_state.value = source
        session.add(mode_state)
    session.commit()
    return rows
