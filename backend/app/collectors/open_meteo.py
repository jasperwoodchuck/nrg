import json
import logging
import math
import time
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import AppState, CacheRecord, ForecastRecord
from app.forecast.model import estimate_intensity

logger = logging.getLogger(__name__)
URL = "https://api.open-meteo.com/v1/forecast"
VARS = "temperature_2m,cloud_cover,wind_speed_80m,shortwave_radiation,precipitation"
WEATHER_KEYS = tuple(VARS.split(","))


def _validate_payload(payload: object) -> dict:
    if not isinstance(payload, dict):
        raise ValueError("Open-Meteo response must be a JSON object")
    hourly = payload.get("hourly")
    if not isinstance(hourly, dict):
        raise ValueError("Open-Meteo response is missing hourly data")
    times = hourly.get("time")
    if not isinstance(times, list) or not times:
        raise ValueError("Open-Meteo response contains no hourly timestamps")
    local_zone = ZoneInfo(settings.timezone)
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
        except (ValueError, TypeError, json.JSONDecodeError):
            logger.warning("Ignoring malformed cached %s response", source)
    return None


def _fallback_payload() -> dict:
    now = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    times = [(now + timedelta(hours=index)).isoformat() for index in range(72)]
    return {
        "hourly": {
            "time": times,
            "temperature_2m": [25.0] * len(times),
            "cloud_cover": [50.0] * len(times),
            "wind_speed_80m": [3.0] * len(times),
            "shortwave_radiation": [0.0] * len(times),
            "precipitation": [0.0] * len(times),
        }
    }


def _request_payload(client: httpx.Client) -> dict:
    params = {
        "latitude": settings.latitude,
        "longitude": settings.longitude,
        "hourly": VARS,
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
        fetched_at = datetime.now(timezone.utc)
        session.add(CacheRecord(source="open_meteo", payload=json.dumps(payload, allow_nan=False), fetched_at=fetched_at))
        success = session.get(AppState, "last_source_success:open_meteo")
        if success is None:
            success = AppState(key="last_source_success:open_meteo", value="")
        success.value = fetched_at.isoformat()
        session.add(success)
        session.commit()
        source = "LIVE"
    except Exception as exc:
        logger.warning("Weather collection failed; using cached data or model fallback: %s", exc)
        session.rollback()
        payload = cached_payload(session, "open_meteo")
        source = "CACHED" if payload is not None else "ESTIMATED"
    finally:
        if owns_client:
            http_client.close()

    if payload is None:
        payload = _fallback_payload()
    hourly = payload["hourly"]
    rows: list[ForecastRecord] = []
    local_zone = ZoneInfo(settings.timezone)
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
    session.commit()
    return rows
