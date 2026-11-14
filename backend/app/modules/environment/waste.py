"""Small deterministic waste-collection routing demo; all readings are simulated."""

SIMULATED_BINS = (
    {"id": "BIN-01", "zone": "Market Street", "fill_percent": 94, "capacity_kg": 120, "daily_fill_percent": 18},
    {"id": "BIN-02", "zone": "Riverside Park", "fill_percent": 71, "capacity_kg": 80, "daily_fill_percent": 12},
    {"id": "BIN-03", "zone": "Central Station", "fill_percent": 88, "capacity_kg": 150, "daily_fill_percent": 22},
    {"id": "BIN-04", "zone": "North Campus", "fill_percent": 42, "capacity_kg": 100, "daily_fill_percent": 9},
    {"id": "BIN-05", "zone": "Civic Center", "fill_percent": 79, "capacity_kg": 90, "daily_fill_percent": 15},
    {"id": "BIN-06", "zone": "South Depot", "fill_percent": 56, "capacity_kg": 110, "daily_fill_percent": 11},
)


def build_collection_plan() -> dict:
    """Prioritize bins predicted to reach 80% within 12 hours, within truck capacity."""
    truck_capacity_kg = 300
    horizon_hours = 12
    candidates = []
    bins = []
    for item in SIMULATED_BINS:
        projected_fill = min(
            100,
            item["fill_percent"] + item["daily_fill_percent"] * horizon_hours / 24,
        )
        estimated_kg = round(item["capacity_kg"] * item["fill_percent"] / 100, 1)
        bin_row = {
            **item,
            "projected_fill_12h": round(projected_fill, 1),
            "estimated_waste_kg": estimated_kg,
            "pickup_recommended": projected_fill >= 80,
            "selected": False,
        }
        bins.append(bin_row)
        if bin_row["pickup_recommended"]:
            candidates.append(bin_row)

    candidates.sort(key=lambda item: (-item["projected_fill_12h"], item["id"]))
    selected = []
    planned_kg = 0.0
    for item in candidates:
        if planned_kg + item["estimated_waste_kg"] <= truck_capacity_kg:
            item["selected"] = True
            selected.append(item)
            planned_kg += item["estimated_waste_kg"]

    at_risk_before = sum(item["projected_fill_12h"] >= 100 for item in bins)
    at_risk_after = sum(
        item["projected_fill_12h"] >= 100 and not item["selected"] for item in bins
    )
    return {
        "source": "SIMULATED",
        "methodology": "Select bins projected to reach 80% fill within 12 hours, highest fill first, up to a 300 kg truck capacity.",
        "truck_capacity_kg": truck_capacity_kg,
        "horizon_hours": horizon_hours,
        "summary": {
            "bins_monitored": len(bins),
            "pickups_recommended": len(candidates),
            "pickups_planned": len(selected),
            "planned_waste_kg": round(planned_kg, 1),
            "projected_overflow_risk_before": at_risk_before,
            "projected_overflow_risk_after": at_risk_after,
        },
        "bins": bins,
    }
