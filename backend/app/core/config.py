from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite:///./terrapulse.db"
    latitude: float = 22.57
    longitude: float = 88.36
    timezone: str = "Asia/Kolkata"
    frontend_origin: str = "http://localhost:5173"
    electricity_maps_api_key: str | None = None
    gemini_api_key: str | None = None
    india_grid_average_gco2_kwh: float = 700.0
    solar_reduction_fraction: float = 0.42
    wind_reduction_fraction: float = 0.12
    evening_peak_increase_fraction: float = 0.22
    high_temperature_increase_fraction: float = 0.12
    high_temperature_c: float = 32.0
    solar_radiation_full_scale_w_m2: float = 800.0
    wind_speed_full_scale_m_s: float = 20.0
    evening_peak_start_hour: int = 18
    evening_peak_end_hour: int = 22
    random_seed: int = 417


settings = Settings()
