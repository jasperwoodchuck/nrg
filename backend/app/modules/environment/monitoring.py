import json
import math
import re
from datetime import datetime, timedelta, timezone
from functools import lru_cache

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import CacheRecord

WATER_PACKAGE_URL = "https://nwdp.nwic.gov.in/api/3/action/package_show"
WATER_DATA_URL = "https://nwdp.nwic.gov.in/api/3/action/datastore_search"
WATER_PACKAGE_ID = "d54d7702-d21f-408f-8dc0-2665bde47201"
AIR_QUALITY_URL = "https://air-quality-api.open-meteo.com/v1/air-quality"
WATER_CACHE_TTL = timedelta(hours=24)
AIR_CACHE_TTL = timedelta(minutes=30)
WATER_PARAMETERS = {
    "Potential of Hydrogen (pH)": ("pH", "pH"),
    "Dissolved oxygen (mg/L)": ("Dissolved oxygen", "mg/L"),
    "Total Dissolved Solids (mg/L)": ("Total dissolved solids", "mg/L"),
    "Chloride (mg/L)": ("Chloride", "mg/L"),
    "Nitrate (mg/L)": ("Nitrate", "mg/L"),
    "Arsenic (mg/L)": ("Arsenic", "mg/L"),
    "Lead (mg/L)": ("Lead", "mg/L"),
    "Iron(mg/L)": ("Iron", "mg/L"),
}


def _utc(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


@lru_cache(maxsize=1)
def _water_resources() -> tuple[dict[str, str], list[str]]:
    with httpx.Client(timeout=12.0) as client:
        response = client.get(WATER_PACKAGE_URL, params={"id": WATER_PACKAGE_ID})
        response.raise_for_status()
        payload = response.json()
    if not isinstance(payload, dict) or payload.get("success") is not True or not isinstance(payload.get("result"), dict):
        raise RuntimeError("National Water Data Portal returned an invalid dataset catalog")

    resources: dict[str, str] = {}
    for resource in payload["result"].get("resources", []):
        if not isinstance(resource, dict):
            continue
        name = resource.get("name")
        resource_id = resource.get("id")
        if not isinstance(name, str) or not isinstance(resource_id, str) or "2021 - 2025" not in name:
            continue
        match = re.search(r"CPCB\s+(.+?)\s*\(2021\s*-\s*2025\)", name, re.IGNORECASE)
        if match:
            resources[match.group(1).strip()] = resource_id
    return resources, sorted(resources, key=str.casefold)


def water_quality_regions() -> dict:
    try:
        _, regions = _water_resources()
    except (httpx.HTTPError, ValueError, RuntimeError) as error:
        raise RuntimeError(f"Could not load water-monitoring regions: {error}") from error
    return {
        "regions": regions,
        "source": "National Water Data Portal · CPCB",
        "measured_by": "Manual surface-water sampling; 2021–2025 datasets",
    }


def _cached_records(session: Session, region: str) -> tuple[list[dict], str, str]:
    cache_key = f"nwdp_water_quality:{region.casefold()}"
    cached = session.scalar(select(CacheRecord).where(CacheRecord.source == cache_key).order_by(CacheRecord.fetched_at.desc()).limit(1))
    now = datetime.now(timezone.utc)
    if cached is not None and now - _utc(cached.fetched_at) < WATER_CACHE_TTL:
        return json.loads(cached.payload), "CACHED", _utc(cached.fetched_at).isoformat()

    resources, regions = _water_resources()
    resource_id = next((value for name, value in resources.items() if name.casefold() == region.casefold()), None)
    if resource_id is None:
        raise ValueError(f"No 2021–2025 CPCB water-quality dataset is available for {region}. Available regions: {', '.join(regions)}")

    try:
        with httpx.Client(timeout=20.0) as client:
            response = client.get(WATER_DATA_URL, params={"resource_id": resource_id, "limit": 5000})
            response.raise_for_status()
            payload = response.json()
    except (httpx.HTTPError, ValueError) as error:
        if cached is not None:
            return json.loads(cached.payload), "CACHED", _utc(cached.fetched_at).isoformat()
        raise RuntimeError(f"National Water Data Portal request failed: {error}") from error

    result = payload.get("result") if isinstance(payload, dict) and payload.get("success") is True else None
    records = result.get("records") if isinstance(result, dict) else None
    if not isinstance(records, list):
        if cached is not None:
            return json.loads(cached.payload), "CACHED", _utc(cached.fetched_at).isoformat()
        raise RuntimeError("National Water Data Portal returned no water-quality records")

    fetched_at = datetime.now(timezone.utc)
    session.add(CacheRecord(source=cache_key, payload=json.dumps(records, allow_nan=False), fetched_at=fetched_at))
    session.commit()
    return records, "PORTAL", fetched_at.isoformat()


def _distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)
    arc = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    return radius * 2 * math.atan2(math.sqrt(arc), math.sqrt(1 - arc))


def _measurement_time(value: object) -> datetime | None:
    if not isinstance(value, str):
        return None
    for pattern in ("%d-%m-%Y %H:%M", "%d-%m-%Y"):
        try:
            return datetime.strptime(value, pattern).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None


def get_water_quality(session: Session, region: str, latitude: float, longitude: float, radius_km: float = 100) -> dict:
    records, source, fetched_at = _cached_records(session, region)
    latest_by_station: dict[tuple[str, str, str, str], tuple[datetime, dict, float]] = {}
    for record in records:
        if not isinstance(record, dict):
            continue
        try:
            station_lat = float(record["Latitude"])
            station_lon = float(record["Longitude"])
        except (KeyError, TypeError, ValueError):
            continue
        distance = _distance_km(latitude, longitude, station_lat, station_lon)
        if distance > radius_km:
            continue
        measured_at = _measurement_time(record.get("Data Acquisition Time"))
        station_name = record.get("Station")
        if measured_at is None or not isinstance(station_name, str):
            continue
        station_key = (
            station_name.casefold(),
            str(record.get("District") or "").casefold(),
            record["Latitude"],
            record["Longitude"],
        )
        previous = latest_by_station.get(station_key)
        if previous is None or measured_at > previous[0]:
            latest_by_station[station_key] = (measured_at, record, distance)

    stations = []
    for measured_at, record, distance in latest_by_station.values():
        parameters = []
        for source_name, (label, unit) in WATER_PARAMETERS.items():
            raw = record.get(source_name)
            try:
                value = float(raw)
            except (TypeError, ValueError):
                continue
            if math.isfinite(value):
                parameters.append({"name": label, "value": value, "unit": unit})
        stations.append({
            "station": record["Station"],
            "district": record.get("District"),
            "waterbody": record.get("Local River") if record.get("Local River") not in (None, "-") else record.get("River"),
            "latitude": float(record["Latitude"]),
            "longitude": float(record["Longitude"]),
            "distance_km": round(distance, 1),
            "sampled_at": measured_at.isoformat(),
            "parameters": parameters,
        })
    stations.sort(key=lambda station: station["distance_km"])
    if not stations:
        return {
            "source": source,
            "region": region,
            "fetched_at": fetched_at,
            "radius_km": radius_km,
            "stations": [],
            "note": f"No CPCB sampling station in {region} has a recorded sample within {radius_km:g} km of this location.",
        }
    return {
        "source": source,
        "region": region,
        "fetched_at": fetched_at,
        "radius_km": radius_km,
        "dataset_period": "2021–2025 manual measurements",
        "stations": stations[:8],
        "note": "These are historical laboratory samples, not live sensor readings or a drinking-water safety determination.",
    }


def get_air_quality(session: Session) -> dict:
    latitude, longitude = settings.latitude, settings.longitude
    cache_key = f"open_meteo_air_quality:{latitude:.4f}:{longitude:.4f}"
    cached = session.scalar(select(CacheRecord).where(CacheRecord.source == cache_key).order_by(CacheRecord.fetched_at.desc()).limit(1))
    now = datetime.now(timezone.utc)
    if cached is not None and now - _utc(cached.fetched_at) < AIR_CACHE_TTL:
        payload = json.loads(cached.payload)
        source = "CACHED"
        fetched_at = _utc(cached.fetched_at).isoformat()
    else:
        try:
            with httpx.Client(timeout=12.0) as client:
                response = client.get(AIR_QUALITY_URL, params={
                    "latitude": latitude,
                    "longitude": longitude,
                    "current": "pm10,pm2_5,nitrogen_dioxide,ozone",
                    "hourly": "pm10,pm2_5,nitrogen_dioxide,ozone",
                    "forecast_hours": 48,
                    "timezone": "auto",
                    "domains": "cams_global",
                })
                response.raise_for_status()
                payload = response.json()
            if not isinstance(payload, dict) or not isinstance(payload.get("hourly"), dict):
                raise ValueError("Open-Meteo returned an invalid air-quality response")
            fetched = datetime.now(timezone.utc)
            session.add(CacheRecord(source=cache_key, payload=json.dumps(payload, allow_nan=False), fetched_at=fetched))
            session.commit()
            source = "LIVE"
            fetched_at = fetched.isoformat()
        except (httpx.HTTPError, ValueError) as error:
            if cached is None:
                raise RuntimeError(f"Open-Meteo air-quality request failed: {error}") from error
            payload = json.loads(cached.payload)
            source = "CACHED"
            fetched_at = _utc(cached.fetched_at).isoformat()

    hourly = payload["hourly"]
    times = hourly.get("time") if isinstance(hourly.get("time"), list) else []
    rows = []
    for index, timestamp in enumerate(times[:48]):
        if not isinstance(timestamp, str):
            continue
        rows.append({
            "timestamp": timestamp,
            "pm2_5": hourly.get("pm2_5", [])[index] if isinstance(hourly.get("pm2_5"), list) and index < len(hourly["pm2_5"]) else None,
            "pm10": hourly.get("pm10", [])[index] if isinstance(hourly.get("pm10"), list) and index < len(hourly["pm10"]) else None,
            "nitrogen_dioxide": hourly.get("nitrogen_dioxide", [])[index] if isinstance(hourly.get("nitrogen_dioxide"), list) and index < len(hourly["nitrogen_dioxide"]) else None,
            "ozone": hourly.get("ozone", [])[index] if isinstance(hourly.get("ozone"), list) and index < len(hourly["ozone"]) else None,
        })
    return {
        "source": source,
        "provider": "Open-Meteo · Copernicus CAMS Global",
        "data_type": "modeled forecast",
        "location": {"latitude": payload.get("latitude"), "longitude": payload.get("longitude"), "timezone": payload.get("timezone")},
        "current": payload.get("current", {}),
        "current_units": payload.get("current_units", {}),
        "fetched_at": fetched_at,
        "hourly": rows,
        "note": "Modeled air-quality forecast (~45 km global grid), not a local sensor measurement.",
    }
