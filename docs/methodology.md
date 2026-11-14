# NRG methodology

## Data and source badges

- **Open-Meteo**: current conditions, 15-minute temperature/precipitation/80 m wind/shortwave radiation, hourly temperature/cloud cover/80 m wind/shortwave radiation/precipitation, and daily aggregates are fetched together for the configured latitude/longitude and timezone (`forecast_days=3`, `forecast_minutely_15=96`). The collector explicitly requests `wind_speed_unit=ms` because the fallback model normalizes wind in m/s. Weather responses are cached in SQLite. A fresh response is `LIVE`; a reused response is `CACHED`. Per Open-Meteo, regions outside Central Europe and North America receive interpolated hourly model output in the 15-minute series; see [Forecast API docs](https://open-meteo.com/en/docs).
- **Carbon intensity**: currently derived from the configured fallback model. These intensity values are `ESTIMATED` (or `CACHED` when computed from cached weather). Electricity Maps is not currently integrated; the optional API key is reserved and the fallback remains active.
- **Loads and schedules**: all fleet devices, decisions, and outcomes are virtual and labeled `SIMULATED`.
- **Impact metrics**: calculated from simulated load records and estimated intensity inputs; metrics include their `source`, formula ID, inputs, factor-set version, and computation time.

## Factor set `india-grid-v1`

Configurable settings (also exposed as environment variables by uppercase field name):

| Setting | Default | Meaning |
|---|---:|---|
| `INDIA_GRID_AVERAGE_GCO2_KWH` | 700 | Approximate India-grid anchor, noted against CEA baseline; demo assumption |
| `SOLAR_REDUCTION_FRACTION` | 0.42 | Maximum fractional intensity reduction at full-scale radiation |
| `SOLAR_RADIATION_FULL_SCALE_W_M2` | 800 | Radiation normalization value |
| `WIND_REDUCTION_FRACTION` | 0.12 | Maximum fractional reduction at full-scale wind |
| `WIND_SPEED_FULL_SCALE_M_S` | 20 | Wind normalization value |
| `EVENING_PEAK_INCREASE_FRACTION` | 0.22 | Increase during configured evening hours |
| `EVENING_PEAK_START_HOUR` / `EVENING_PEAK_END_HOUR` | 18 / 22 | Local model hour range (inclusive) |
| `HIGH_TEMPERATURE_INCREASE_FRACTION` | 0.12 | Increase at or above high-temperature threshold |
| `HIGH_TEMPERATURE_C` | 32 | Threshold in Celsius |

Citation note: the 700 gCO2/kWh anchor is a configurable approximate India grid average informed by the Central Electricity Authority (CEA) baseline concept. It is not asserted as a live or official current reading; configure and cite the exact CEA factor set when deploying for reporting.

## Fallback intensity formula

For hour `t`, `solar = min(max(shortwave_radiation, 0) / solar_radiation_full_scale, 1)` and `wind = min(max(wind_speed_80m, 0) / wind_speed_full_scale, 1)`. `peak` equals the configured peak increase inside the evening range, otherwise zero. `heat` equals the configured temperature increase when temperature meets the threshold, otherwise zero.

`intensity_gco2_kwh = max(0, grid_anchor * (1 - solar * solar_reduction - wind * wind_reduction + peak + heat))`.

This deterministic fallback uses weather observations/forecast inputs when available and neutral safe defaults otherwise. The calculation does not predict actual dispatch or marginal emissions.

## Baselines and avoided emissions

For each completed load `i`, energy remains unchanged before and after shifting:

- Baseline A (typical default time): `baseline_a_g_i = kWh_i * intensity_at_typical_time_i`. The virtual fleet uses representative common-use times (for example EV at 19:00).
- Baseline B (conservative daily mean): `baseline_b_g_i = kWh_i * mean_daily_intensity_i`.
- Optimized: `optimized_g_i = kWh_i * mean_intensity_over_selected_window_i`.
- Avoided: `saved_a_g_i = baseline_a_g_i - optimized_g_i`; similarly for B.
- Percent saved: `100 * sum(saved_i) / sum(baseline_i)` for the corresponding baseline.
- Total kWh shifted: sum of energy of uniquely completed optimized loads. This is carbon-aware load shifting, **not energy reduction**.

The optimizer considers contiguous hourly windows fully within the forecast and ends no later than the load deadline. It selects the candidate with the lowest average intensity. Completion is recorded once by changing the load state from `scheduled` to `completed`; only completed rows contribute to impact totals.
