import json
import logging
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


def cached_payload(session: Session, source: str) -> dict | None:
    item = session.scalar(select(CacheRecord).where(CacheRecord.source == source).order_by(CacheRecord.fetched_at.desc()).limit(1))
    return json.loads(item.payload) if item else None


def collect_weather(session: Session, client: httpx.Client | None = None) -> list[ForecastRecord]:
    own_client = client is None
    client = client or httpx.Client(timeout=3.0)
    payload = None
    try:
        candidate = None
        last_error = None
        for attempt in range(3):
            try:
                response = client.get(URL, params={"latitude": settings.latitude, "longitude": settings.longitude, "hourly": VARS, "forecast_days": 3, "timezone": settings.timezone})
                response.raise_for_status()
                candidate = response.json()
                break
            except Exception as exc:
                last_error = exc
                if attempt < 2:
                    time.sleep(0.25 * (2 ** attempt))
        if candidate is None:
            raise last_error or RuntimeError("Open-Meteo unavailable")
        hourly = candidate.get("hourly")
        if not isinstance(hourly, dict) or not isinstance(hourly.get("time"), list) or not hourly["time"]:
            raise ValueError("Malformed Open-Meteo hourly response")
        for key in VARS.split(","):
            values = hourly.get(key)
            if not isinstance(values, list) or len(values) != len(hourly["time"]):
                raise ValueError(f"Malformed Open-Meteo series: {key}")
        payload = candidate
        fetched_at = datetime.now(timezone.utc)
        session.add(CacheRecord(source="open_meteo", payload=json.dumps(payload), fetched_at=fetched_at))
        success = session.get(AppState, "last_source_success:open_meteo") or AppState(key="last_source_success:open_meteo", value="")
        success.value = fetched_at.isoformat()
        session.add(success)
        session.commit()
        source = "LIVE"
    except Exception as exc:
        logger.warning("Weather collection failed; using cached data or model fallback: %s", exc)
        session.rollback()
        payload = cached_payload(session, "open_meteo")
        source = "CACHED" if payload else "ESTIMATED"
    finally:
        if own_client:
            client.close()

    if payload is None:
        now = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
        payload = {"hourly": {"time": [(now + timedelta(hours=i)).isoformat() for i in range(72)], "temperature_2m": [25.0] * 72, "cloud_cover": [50.0] * 72, "wind_speed_80m": [3.0] * 72, "shortwave_radiation": [0.0] * 72, "precipitation": [0.0] * 72}}
    hourly = payload["hourly"]
    keys = ("temperature_2m", "cloud_cover", "wind_speed_80m", "shortwave_radiation", "precipitation")
    rows = []
    for index, value in enumerate(hourly["time"]):
        try:
            at = datetime.fromisoformat(value)
            if at.tzinfo is None:
                at = at.replace(tzinfo=ZoneInfo(settings.timezone))
            at = at.astimezone(timezone.utc)
            weather = {key: (hourly.get(key) or [None] * len(hourly["time"]))[index] for key in keys}
            intensity = estimate_intensity(at, weather)
            intensity_source = "CACHED" if source == "CACHED" else "ESTIMATED"
            row = session.scalar(select(ForecastRecord).where(ForecastRecord.timestamp == at))
            if row is None:
                row = ForecastRecord(timestamp=at, intensity=intensity, source=intensity_source, weather_json=json.dumps(weather))
                session.add(row)
            else:
                row.intensity, row.source, row.weather_json = intensity, intensity_source, json.dumps(weather)
            rows.append(row)
        except (ValueError, IndexError, TypeError):
            continue
    session.commit()
    return rows
