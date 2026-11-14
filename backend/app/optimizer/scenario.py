from datetime import datetime, timedelta, timezone

AVERAGE_HOUSEHOLD_DAILY_KWH = 1805 / 365
FLEXIBLE_LOADS = {
    "ac_precool": (0.11, 2, 16, 20),
    "washing_machine": (0.08, 1, 9, 22),
}


def run_scenario(forecast_rows: list[dict], households: int, max_concurrent_loads: int = 12) -> dict:
    """Estimate flexible appliance scheduling from BEE's average household use."""
    forecasts = [
        {
            "timestamp": row["timestamp"].replace(tzinfo=timezone.utc)
            if row["timestamp"].tzinfo is None
            else row["timestamp"],
            "intensity": float(row["intensity"]),
            "source": row["source"],
        }
        for row in forecast_rows
    ]
    if not forecasts:
        raise ValueError("No grid forecast is available. Refresh the forecast and try again.")

    intensities = {row["timestamp"]: row["intensity"] for row in forecasts}
    daily_average = sum(intensities.values()) / len(intensities)
    now = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    loads = []
    for household in range(1, households + 1):
        for kind, (consumption_share, duration, usual_hour, deadline_hour) in FLEXIBLE_LOADS.items():
            energy_kwh = round(AVERAGE_HOUSEHOLD_DAILY_KWH * consumption_share, 4)
            baseline_at = now.replace(hour=usual_hour)
            if baseline_at < now:
                baseline_at += timedelta(days=1)
            deadline = baseline_at.replace(hour=deadline_hour)
            while deadline < baseline_at + timedelta(hours=duration):
                deadline += timedelta(days=1)
            loads.append({
                "household": household,
                "load": kind,
                "energy_kwh": energy_kwh,
                "duration_hours": duration,
                "baseline_at": baseline_at,
                "deadline": deadline,
                "baseline_intensity": intensities.get(baseline_at, daily_average),
            })

    # Schedule the tightest deadlines first, then choose the cleanest remaining
    # window that respects the modeled grid's concurrent-load capacity.
    loads.sort(key=lambda load: (load["deadline"], -load["duration_hours"], -load["energy_kwh"], load["household"], load["load"]))
    concurrent_by_hour: dict[datetime, int] = {}
    decisions = []
    baseline_g = 0.0
    optimized_g = 0.0
    shifted_kwh = 0.0
    optimized_loads = 0
    capacity_limited = 0

    for load in loads:
        duration = load["duration_hours"]
        baseline_intensity = load["baseline_intensity"]
        candidates = []
        for start, intensity in sorted(intensities.items()):
            end = start + timedelta(hours=duration)
            if start < now or end > load["deadline"]:
                continue
            hours = [start + timedelta(hours=offset) for offset in range(duration)]
            if not all(hour in intensities for hour in hours):
                continue
            if any(concurrent_by_hour.get(hour, 0) >= max_concurrent_loads for hour in hours):
                continue
            average_intensity = sum(intensities[hour] for hour in hours) / duration
            candidates.append((average_intensity, start, hours))

        unconstrained_available = any(
            start >= now
            and start + timedelta(hours=duration) <= load["deadline"]
            and all(start + timedelta(hours=offset) in intensities for offset in range(duration))
            for start in intensities
        )
        choice = min(candidates, default=None, key=lambda candidate: (candidate[0], candidate[1]))
        chosen_intensity, chosen_start, chosen_hours = choice if choice else (baseline_intensity, None, [])
        saving_g = load["energy_kwh"] * (baseline_intensity - chosen_intensity) if choice else 0.0
        baseline_g += load["energy_kwh"] * baseline_intensity
        optimized_g += load["energy_kwh"] * chosen_intensity
        if choice:
            shifted_kwh += load["energy_kwh"]
            optimized_loads += 1
            for hour in chosen_hours:
                concurrent_by_hour[hour] = concurrent_by_hour.get(hour, 0) + 1
        elif unconstrained_available:
            capacity_limited += 1

        decisions.append({
            "household": load["household"],
            "load": load["load"],
            "energy_kwh": load["energy_kwh"],
            "duration_hours": duration,
            "baseline_time": load["baseline_at"].isoformat(),
            "chosen_start": chosen_start.isoformat() if chosen_start else None,
            "baseline_intensity_gco2_kwh": round(baseline_intensity, 2),
            "optimized_intensity_gco2_kwh": round(chosen_intensity, 2),
            "saving_g": round(saving_g, 2),
            "status": "scheduled" if choice else "capacity_limited" if unconstrained_available else "no_feasible_window",
        })

    decisions.sort(key=lambda decision: (decision["household"], decision["load"]))

    forecast_sources = {row["source"] for row in forecasts}
    forecast_source = next(iter(forecast_sources)) if len(forecast_sources) == 1 else "MIXED"
    return {
        "source": "SIMULATED",
        "forecast_source": forecast_source,
        "methodology": f"Upper-bound estimate based on the Bureau of Energy Efficiency survey mean of 1,805 kWh per household-year (4.95 kWh/day) and reported appliance consumption shares: air conditioners 11%, washing machines 8%. Only those two modeled flexible loads are scheduled, so their combined energy is 19% of average household use; the time windows and shiftability are assumptions, not meter readings. Loads use the lowest-intensity feasible forecast window with a cap of {max_concurrent_loads} simultaneous estimated loads. Total energy stays constant; no devices are controlled.",
        "summary": {
            "households": households,
            "max_concurrent_loads": max_concurrent_loads,
            "total_loads": len(decisions),
            "loads_optimized": optimized_loads,
            "loads_not_optimized": len(decisions) - optimized_loads,
            "loads_limited_by_capacity": capacity_limited,
            "peak_concurrent_loads": max(concurrent_by_hour.values(), default=0),
            "energy_shifted_kwh": round(shifted_kwh, 2),
            "energy_consumed_kwh": round(sum(row["energy_kwh"] for row in decisions), 2),
            "baseline_co2_g": round(baseline_g, 2),
            "optimized_co2_g": round(optimized_g, 2),
            "co2_avoided_g": round(baseline_g - optimized_g, 2),
        },
        "decisions": decisions,
    }
