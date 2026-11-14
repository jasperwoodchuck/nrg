from datetime import datetime
from app.core.config import Settings, settings


def estimate_intensity(at: datetime, weather: dict, config: Settings = settings) -> float:
    radiation = max(0.0, float(weather.get("shortwave_radiation", 0) or 0))
    wind = max(0.0, float(weather.get("wind_speed_80m", 0) or 0))
    temp = float(weather.get("temperature_2m", 25) or 25)
    solar = min(radiation / config.solar_radiation_full_scale_w_m2, 1.0)
    wind_factor = min(wind / config.wind_speed_full_scale_m_s, 1.0)
    evening = config.evening_peak_increase_fraction if config.evening_peak_start_hour <= at.hour <= config.evening_peak_end_hour else 0.0
    heat = config.high_temperature_increase_fraction if temp >= config.high_temperature_c else 0.0
    return round(max(0.0, config.india_grid_average_gco2_kwh * (1 - solar * config.solar_reduction_fraction - wind_factor * config.wind_reduction_fraction + evening + heat)), 2)
