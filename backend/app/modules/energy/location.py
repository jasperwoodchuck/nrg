import json
import logging
import math
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import AppState

logger = logging.getLogger(__name__)
LOCATION_STATE_KEY = "location:current"


class LocationInput(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    timezone: str | None = None

    @field_validator("latitude", "longitude")
    @classmethod
    def finite_coordinate(cls, value: float) -> float:
        if not math.isfinite(value):
            raise ValueError("Coordinates must be finite numbers")
        return value

    @field_validator("timezone")
    @classmethod
    def valid_timezone(cls, value: str | None) -> str | None:
        if value is None:
            return value
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError) as exc:
            raise ValueError("timezone must be a valid IANA timezone") from exc
        return value


def current_location() -> dict:
    return {"latitude": settings.latitude, "longitude": settings.longitude, "timezone": settings.timezone}


def weather_cache_key(latitude: float, longitude: float, timezone: str) -> str:
    return f"open_meteo:{latitude:.6f}:{longitude:.6f}:{timezone}"


def persist_location(session: Session) -> None:
    state = session.get(AppState, LOCATION_STATE_KEY)
    if state is None:
        state = AppState(key=LOCATION_STATE_KEY, value="")
    state.value = json.dumps(current_location())
    session.add(state)


def restore_location(session: Session) -> None:
    state = session.get(AppState, LOCATION_STATE_KEY)
    if state is None:
        return
    try:
        location = LocationInput.model_validate(json.loads(state.value))
    except (ValueError, TypeError) as exc:
        logger.warning("Ignoring invalid persisted location: %s", exc)
        return
    settings.latitude = location.latitude
    settings.longitude = location.longitude
    if location.timezone is not None:
        settings.timezone = location.timezone
