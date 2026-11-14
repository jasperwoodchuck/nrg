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
_cache_value: dict[str, Any] | None = None
_cache_time = 0.0


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


def _fetch_public_grid(client: httpx.Client) -> dict[str, Any]:
    snapshot = _call_tool(client, "india_grid_live_snapshot", {"coverage_threshold": 0.5})
    supply = _call_tool(client, "india_grid_posoco_psp", {})

    nation = snapshot.get("nation")
    if not isinstance(nation, dict) or nation.get("has_data") is not True or not _number(nation.get("demand_mw")):
        raise ValueError("Public grid service returned no valid All India demand reading")
    if not isinstance(nation.get("timestamp"), str) or not isinstance(nation.get("source_type"), str):
        raise ValueError("Public grid service returned incomplete demand provenance")

    items = supply.get("items")
    latest_date = supply.get("latest_date")
    if not isinstance(items, list) or not isinstance(latest_date, str):
        raise ValueError("Public grid service returned an invalid daily supply report")
    all_india = next(
        (item for item in items if isinstance(item, dict) and item.get("region") == "All India" and item.get("date") == latest_date),
        None,
    )
    if all_india is None or any(
        not _number(all_india.get(field))
        for field in ("energy_met_mu", "energy_shortage_mu", "peak_demand_met_mw")
    ):
        raise ValueError("Public grid service returned no complete All India supply report")

    return {
        "provider": "India Energy Atlas",
        "source": "PUBLIC",
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "stale": False,
        "snapshot": {
            "demand_mw": nation["demand_mw"],
            "timestamp": nation["timestamp"],
            "source_type": nation["source_type"],
            "source": nation.get("source"),
            "basis": nation.get("basis"),
            "age_minutes": nation.get("age_minutes"),
            "coverage": snapshot.get("coverage"),
        },
        "daily": {
            "date": latest_date,
            "energy_met_mu": all_india["energy_met_mu"],
            "energy_shortage_mu": all_india["energy_shortage_mu"],
            "peak_demand_met_mw": all_india["peak_demand_met_mw"],
        },
        "sources": {
            "live_demand": "https://npp.gov.in/",
            "daily_supply_position": "https://grid-india.in/",
            "provider": "https://www.energymap.in/developer/mcp/public",
        },
    }


def get_public_grid_data() -> dict[str, Any]:
    global _cache_value, _cache_time
    with _cache_lock:
        now = time.monotonic()
        if _cache_value is not None and now - _cache_time < CACHE_SECONDS:
            return _cache_value

        try:
            with httpx.Client(timeout=httpx.Timeout(8.0, connect=3.0)) as client:
                result = _fetch_public_grid(client)
            _cache_value = result
            _cache_time = time.monotonic()
            return result
        except (httpx.HTTPError, ValueError, RuntimeError, json.JSONDecodeError) as error:
            if _cache_value is not None:
                logger.warning("Public grid refresh failed; serving the last validated response: %s", error)
                return {**_cache_value, "stale": True}
            raise RuntimeError(f"Public grid data is unavailable: {error}") from error
