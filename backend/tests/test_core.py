from datetime import datetime, timedelta, timezone
from app.forecast.model import estimate_intensity
from app.modules.impact.engine import calculate_load, summarize
from app.optimizer.engine import choose_window


def test_golden_impact_value():
    result = calculate_load(3, 700, 700, 450)
    assert result["saved_a_g"] == 750
    assert result["saved_b_g"] == 750


def test_fallback_midday_is_cleaner_than_evening_peak():
    midday = estimate_intensity(datetime(2026, 1, 1, 12, tzinfo=timezone.utc), {"shortwave_radiation": 800, "wind_speed_80m": 0, "temperature_2m": 25})
    evening = estimate_intensity(datetime(2026, 1, 1, 19, tzinfo=timezone.utc), {"shortwave_radiation": 0, "wind_speed_80m": 0, "temperature_2m": 25})
    assert midday < evening


def test_fallback_deterministic():
    at = datetime(2026, 1, 1, 12, tzinfo=timezone.utc)
    weather = {"shortwave_radiation": 300, "wind_speed_80m": 8, "temperature_2m": 30}
    assert estimate_intensity(at, weather) == estimate_intensity(at, weather)


def test_optimizer_respects_deadline_duration_and_horizon():
    start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    forecast = [{"timestamp": start + timedelta(hours=i), "intensity": value} for i, value in enumerate([400, 300, 200, 100])]
    chosen = choose_window(forecast, start, start + timedelta(hours=3), 2)
    assert chosen == (start + timedelta(hours=1), 250)
    assert choose_window(forecast[:2], start, start + timedelta(hours=3), 3) is None
    assert choose_window(forecast, start, start + timedelta(hours=3), 4) is None


def test_summary_does_not_double_count_input_rows():
    row = {"kwh": 3, "saved_a_g": 750, "saved_b_g": 300, "baseline_a_g": 2100, "baseline_b_g": 1650}
    result = summarize([row])
    assert result["loads_optimized"] == 1
    assert result["kwh_shifted"] == 3
