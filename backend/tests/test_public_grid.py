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
