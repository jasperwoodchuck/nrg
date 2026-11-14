import json
import logging
import math
import threading
import time
from datetime import datetime, timezone
from typing import Any

import httpx

logger = logging.getLogger(__name__)
PUBLIC_MCP_URL = "https://api.energymap.in/mcp/public"
CACHE_SECONDS = 300
_cache_lock = threading.Lock()
_cache_value: dict[str, dict[str, Any]] = {}
_cache_time: dict[str, float] = {}


def _number(value: object) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _call_tool(client: httpx.Client, tool_name: str, arguments: dict[str, object]) -> dict[str, Any]:
    response = client.post(
        PUBLIC_MCP_URL,
        headers={"Accept": "application/json, text/event-stream"},
        json={
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tools/call",
            "params": {"name": tool_name, "arguments": arguments},
        },
    )
    response.raise_for_status()
    envelope = response.json()
    if not isinstance(envelope, dict):
        raise ValueError("Public grid service returned an invalid MCP response")
    result = envelope.get("result")
    if not isinstance(result, dict) or result.get("isError") is True:
        raise RuntimeError(f"Public grid service failed to run {tool_name}")
    content = result.get("content")
    if not isinstance(content, list):
        raise ValueError("Public grid service response is missing tool content")
    for block in content:
        if isinstance(block, dict) and block.get("type") == "text" and isinstance(block.get("text"), str):
            data = json.loads(block["text"])
            if isinstance(data, dict):
                return data
    raise ValueError("Public grid service response did not contain a data object")


def _fetch_public_grid(client: httpx.Client, state: str | None = None) -> dict[str, Any]:
    snapshot = _call_tool(client, "india_grid_live_snapshot", {"coverage_threshold": 0.5})
    supply_args = {"state": state} if state else {}
    supply = _call_tool(client, "india_grid_posoco_psp", supply_args)

    states = snapshot.get("states")
    reading = snapshot.get("nation")
    if state and isinstance(states, list):
        reading = next(
            (
                item
                for item in states
                if isinstance(item, dict)
                and any(
                    isinstance(item.get(field), str) and item[field].casefold() == state.casefold()
                    for field in ("state", "name")
                )
            ),
            None,
        )
    if not isinstance(reading, dict):
        reading = {}
    has_demand = (
        reading.get("has_data") is True
        and _number(reading.get("demand_mw"))
        and isinstance(reading.get("timestamp"), str)
        and isinstance(reading.get("source_type"), str)
    )

    items = supply.get("items")
    latest_date = supply.get("latest_date")
    if not isinstance(items, list) or not isinstance(latest_date, str):
        raise ValueError("Public grid service returned an invalid daily supply report")
    daily_row = next(
        (
            item
            for item in items
            if isinstance(item, dict)
            and item.get("date") == latest_date
            and (
                isinstance(item.get("name"), str) and item["name"].casefold() == state.casefold()
                if state
                else item.get("region") == "All India"
            )
        ),
        None,
    )
    if daily_row is None and not state:
        raise ValueError("Public grid service returned no complete All India supply report")

    return {
        "provider": "India Energy Atlas",
        "source": "PUBLIC",
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "stale": False,
        "snapshot": {
            "name": reading.get("name", state or "India"),
            "has_data": has_demand,
            "demand_mw": reading.get("demand_mw") if has_demand else None,
            "timestamp": reading.get("timestamp"),
            "source_type": reading.get("source_type"),
            "source": reading.get("source"),
            "basis": reading.get("basis"),
            "age_minutes": reading.get("age_minutes"),
            "coverage": snapshot.get("coverage"),
        },
        "daily": {
            "date": latest_date,
            "energy_met_mu": daily_row.get("energy_met_mu") if daily_row and _number(daily_row.get("energy_met_mu")) else None,
            "energy_shortage_mu": daily_row.get("energy_shortage_mu") if daily_row and _number(daily_row.get("energy_shortage_mu")) else None,
            "peak_demand_met_mw": daily_row.get("peak_demand_met_mw") if daily_row and _number(daily_row.get("peak_demand_met_mw")) else None,
        },
        "sources": {
            "live_demand": "https://npp.gov.in/",
            "daily_supply_position": "https://grid-india.in/",
            "provider": "https://www.energymap.in/developer/mcp/public",
        },
    }


def get_public_grid_data(state: str | None = None) -> dict[str, Any]:
    state = state.strip() if state else None
    cache_key = state.casefold() if state else "india"
    with _cache_lock:
        now = time.monotonic()
        if cache_key in _cache_value and now - _cache_time[cache_key] < CACHE_SECONDS:
            return _cache_value[cache_key]

        try:
            with httpx.Client(timeout=httpx.Timeout(8.0, connect=3.0)) as client:
                result = _fetch_public_grid(client, state)
            _cache_value[cache_key] = result
            _cache_time[cache_key] = time.monotonic()
            return result
        except (httpx.HTTPError, ValueError, RuntimeError, json.JSONDecodeError) as error:
            if cache_key in _cache_value:
                logger.warning("Public grid refresh failed; serving the last validated response: %s", error)
                return {**_cache_value[cache_key], "stale": True}
            raise RuntimeError(f"Public grid data is unavailable: {error}") from error
