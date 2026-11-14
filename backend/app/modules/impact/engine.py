from datetime import datetime
from typing import Iterable


def calculate_load(kwh: float, baseline_intensity: float, daily_average_intensity: float, optimized_intensity: float) -> dict:
    optimized = kwh * optimized_intensity
    default_baseline = kwh * baseline_intensity
    average_baseline = kwh * daily_average_intensity
    return {
        "baseline_a_g": default_baseline,
        "baseline_b_g": average_baseline,
        "optimized_g": optimized,
        "saved_a_g": default_baseline - optimized,
        "saved_b_g": average_baseline - optimized,
        "percent_a": (default_baseline - optimized) / default_baseline * 100 if default_baseline else 0.0,
        "percent_b": (average_baseline - optimized) / average_baseline * 100 if average_baseline else 0.0,
    }


def summarize(loads: Iterable[dict]) -> dict:
    rows = list(loads)
    total_kwh = sum(float(row["kwh"]) for row in rows)
    saved_a = sum(float(row["saved_a_g"]) for row in rows)
    saved_b = sum(float(row["saved_b_g"]) for row in rows)
    base_a = sum(float(row["baseline_a_g"]) for row in rows)
    base_b = sum(float(row["baseline_b_g"]) for row in rows)
    return {"saved_a_g": saved_a, "saved_b_g": saved_b, "percent_a": 100 * saved_a / base_a if base_a else 0, "percent_b": 100 * saved_b / base_b if base_b else 0, "kwh_shifted": total_kwh, "loads_optimized": len(rows)}
