from datetime import datetime, timedelta, timezone

from app.optimizer.engine import choose_window
from app.simulator.fleet import KINDS


def run_scenario(forecast_rows: list[dict], households: int) -> dict:
    """Build an in-memory virtual fleet and compare typical-time vs optimized use."""
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
    decisions = []
    baseline_g = 0.0
    optimized_g = 0.0
    shifted_kwh = 0.0
    optimized_loads = 0

    for household in range(1, households + 1):
        for kind, (minimum_kwh, maximum_kwh, duration, usual_hour, deadline_hour) in KINDS.items():
            energy_kwh = round((minimum_kwh + maximum_kwh) / 2, 2)
            baseline_at = now.replace(hour=usual_hour)
            if baseline_at < now:
                baseline_at += timedelta(days=1)
            deadline = baseline_at.replace(hour=deadline_hour)
            while deadline < baseline_at + timedelta(hours=duration):
                deadline += timedelta(days=1)

            baseline_intensity = intensities.get(baseline_at, daily_average)
            choice = choose_window(forecasts, now, deadline, duration)
            chosen_start, chosen_intensity = choice if choice else (None, baseline_intensity)
            saving_g = energy_kwh * (baseline_intensity - chosen_intensity) if choice else 0.0
            baseline_g += energy_kwh * baseline_intensity
            optimized_g += energy_kwh * chosen_intensity
            if choice:
                shifted_kwh += energy_kwh
                optimized_loads += 1

            decisions.append({
                "household": household,
                "load": kind,
                "energy_kwh": energy_kwh,
                "duration_hours": duration,
                "baseline_time": baseline_at.isoformat(),
                "chosen_start": chosen_start.isoformat() if chosen_start else None,
                "baseline_intensity_gco2_kwh": round(baseline_intensity, 2),
                "optimized_intensity_gco2_kwh": round(chosen_intensity, 2),
                "saving_g": round(saving_g, 2),
                "status": "scheduled" if choice else "no_feasible_window",
            })

    forecast_sources = {row["source"] for row in forecasts}
    forecast_source = next(iter(forecast_sources)) if len(forecast_sources) == 1 else "MIXED"
    return {
        "source": "SIMULATED",
        "forecast_source": forecast_source,
        "methodology": "Typical-time baseline compared with the lowest-intensity forecast window that fits each load's duration and deadline. Energy use stays constant. Virtual loads only; no devices are controlled.",
        "summary": {
            "households": households,
            "total_loads": len(decisions),
            "loads_optimized": optimized_loads,
            "loads_without_window": len(decisions) - optimized_loads,
            "energy_shifted_kwh": round(shifted_kwh, 2),
            "energy_consumed_kwh": round(sum(row["energy_kwh"] for row in decisions), 2),
            "baseline_co2_g": round(baseline_g, 2),
            "optimized_co2_g": round(optimized_g, 2),
            "co2_avoided_g": round(baseline_g - optimized_g, 2),
        },
        "decisions": decisions,
    }
