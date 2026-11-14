import logging
import threading
import time
from typing import Any

import httpx

logger = logging.getLogger(__name__)
NOMINATIM_REVERSE_URL = "https://nominatim.openstreetmap.org/reverse"
NOMINATIM_USER_AGENT = "MissionAdamasGridDashboard/1.0"
CACHE_SECONDS = 86_400
_cache: dict[tuple[float, float], tuple[float, str | None]] = {}
_cache_lock = threading.Lock()
_last_request_at = 0.0


def _state_from_result(data: Any) -> str | None:
    if not isinstance(data, dict):
        return None
    address = data.get("address")
    if not isinstance(address, dict) or address.get("country_code") != "in":
        return None
    state = address.get("state")
    return state.strip() if isinstance(state, str) and state.strip() else None


def resolve_indian_state(latitude: float, longitude: float) -> str | None:
    """Resolve one user-selected Indian coordinate to a state, caching the result."""
    if not 6.5 <= latitude <= 35.7 or not 68 <= longitude <= 97.5:
        return None

    key = (round(latitude, 6), round(longitude, 6))
    global _last_request_at
    with _cache_lock:
        cached = _cache.get(key)
        if cached and time.monotonic() - cached[0] < CACHE_SECONDS:
            return cached[1]

        wait_seconds = 1.0 - (time.monotonic() - _last_request_at)
        if wait_seconds > 0:
            time.sleep(wait_seconds)
        try:
            with httpx.Client(
                timeout=httpx.Timeout(5.0, connect=3.0),
                headers={"User-Agent": NOMINATIM_USER_AGENT},
            ) as client:
                response = client.get(
                    NOMINATIM_REVERSE_URL,
                    params={
                        "lat": latitude,
                        "lon": longitude,
                        "format": "jsonv2",
                        "zoom": 5,
                        "addressdetails": 1,
                        "layer": "address",
                    },
                )
                _last_request_at = time.monotonic()
                response.raise_for_status()
                state = _state_from_result(response.json())
        except (httpx.HTTPError, ValueError) as error:
            _last_request_at = time.monotonic()
            logger.warning("Could not resolve selected coordinate to an Indian state: %s", error)
            state = None

        _cache[key] = (time.monotonic(), state)
        return state
