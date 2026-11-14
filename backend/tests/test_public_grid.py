from app.modules.energy import public_grid


def test_fetch_public_grid_selects_state_reading_and_daily_row(monkeypatch):
    calls = []
    snapshot = {
        "nation": {"has_data": True, "demand_mw": 200_000, "timestamp": "2026-11-14T10:00:00+05:30", "source_type": "official"},
        "states": [
            {"state": "west-bengal", "name": "West Bengal", "has_data": True, "demand_mw": 10_000, "timestamp": "2026-11-14T10:00:00+05:30", "source_type": "official"},
        ],
        "coverage": {"states": 36},
    }
    supply = {
        "latest_date": "2026-11-13",
        "items": [
            {"region": "All India", "date": "2026-11-13", "energy_met_mu": 4_000, "energy_shortage_mu": 2, "peak_demand_met_mw": 220_000},
            {"name": "West Bengal", "date": "2026-11-13", "energy_met_mu": 150, "energy_shortage_mu": 1, "peak_demand_met_mw": 11_000},
        ],
    }

    def fake_call_tool(client, tool_name, arguments):
        calls.append((tool_name, arguments))
        return snapshot if tool_name == "india_grid_live_snapshot" else supply

    monkeypatch.setattr(public_grid, "_call_tool", fake_call_tool)

    result = public_grid._fetch_public_grid(object(), "West Bengal")

    assert calls[1] == ("india_grid_posoco_psp", {"state": "West Bengal"})
    assert result["snapshot"]["name"] == "West Bengal"
    assert result["snapshot"]["demand_mw"] == 10_000
    assert result["daily"]["energy_met_mu"] == 150


def test_fetch_public_grid_keeps_daily_data_when_live_state_demand_is_unavailable(monkeypatch):
    snapshot = {
        "states": [
            {"state": "dadra-and-nagar-haveli-and-daman-and-diu", "name": "Dadra and Nagar Haveli and Daman and Diu", "has_data": False, "source_type": None},
        ],
    }
    supply = {
        "latest_date": "2026-11-13",
        "items": [
            {"name": "Dadra and Nagar Haveli and Daman and Diu", "date": "2026-11-13", "energy_met_mu": 27.5, "energy_shortage_mu": 0, "peak_demand_met_mw": 1278},
        ],
    }
    monkeypatch.setattr(public_grid, "_call_tool", lambda _client, tool, _args: snapshot if tool == "india_grid_live_snapshot" else supply)

    result = public_grid._fetch_public_grid(object(), "Dadra and Nagar Haveli and Daman and Diu")

    assert result["snapshot"]["has_data"] is False
    assert result["snapshot"]["demand_mw"] is None
    assert result["daily"]["energy_met_mu"] == 27.5


def test_fetch_public_grid_marks_unreported_state_daily_values_unavailable(monkeypatch):
    snapshot = {
        "states": [
            {"state": "andaman-and-nicobar-islands", "name": "Andaman and Nicobar Islands", "has_data": True, "source_type": "modeled", "demand_mw": 46.2, "timestamp": "2026-11-14T08:00:00+00:00"},
        ],
    }
    supply = {"latest_date": "2026-11-13", "items": []}
    monkeypatch.setattr(public_grid, "_call_tool", lambda _client, tool, _args: snapshot if tool == "india_grid_live_snapshot" else supply)

    result = public_grid._fetch_public_grid(object(), "Andaman and Nicobar Islands")

    assert result["snapshot"]["demand_mw"] == 46.2
    assert result["daily"]["date"] == "2026-11-13"
    assert result["daily"]["energy_met_mu"] is None
