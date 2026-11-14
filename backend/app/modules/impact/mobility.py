"""Passenger trip emissions estimates using published Tamil Nadu guidance factors."""

MODE_FACTORS_KGCO2E_PER_KM = {
    "petrol_car": ("Average petrol car", 0.17, "vehicle-km"),
    "electric_car": ("Battery electric car", 0.05, "vehicle-km"),
    "motorbike": ("Average motorbike", 0.11, "vehicle-km"),
    "local_bus": ("Average local bus", 0.10, "passenger-km"),
    "national_rail": ("National rail", 0.04, "passenger-km"),
}
BASELINE_MODE = "petrol_car"
FACTOR_SOURCE = "Tamil Nadu Green Climate Company, Guidance Manual for Sustainable Events, Table 4 (land travel)"
FACTOR_SOURCE_URL = "https://tngcc.tn.gov.in/wp-content/uploads/2025/10/Guidance-Manual-for-Sustainable-Events.pdf"


def estimate_weekly_mobility(
    one_way_distance_km: float,
    commute_days_per_week: int,
    mode: str,
) -> dict[str, object]:
    if mode not in MODE_FACTORS_KGCO2E_PER_KM:
        raise ValueError(f"Unsupported travel mode: {mode}")

    mode_name, factor, factor_basis = MODE_FACTORS_KGCO2E_PER_KM[mode]
    baseline_name, baseline_factor, baseline_basis = MODE_FACTORS_KGCO2E_PER_KM[BASELINE_MODE]
    weekly_passenger_km = one_way_distance_km * 2 * commute_days_per_week
    baseline_kg = weekly_passenger_km * baseline_factor
    selected_kg = weekly_passenger_km * factor
    return {
        "source": "ESTIMATED",
        "factor_source": FACTOR_SOURCE,
        "factor_source_url": FACTOR_SOURCE_URL,
        "methodology": (
            "Weekly estimate = one-way distance × 2 × commute days × mode factor. "
            "Private vehicle scenarios assume one traveler in one vehicle; car and motorbike "
            "factors are per vehicle-km, while bus and rail factors are per passenger-km."
        ),
        "inputs": {
            "one_way_distance_km": one_way_distance_km,
            "commute_days_per_week": commute_days_per_week,
            "round_trip_passenger_km_per_week": weekly_passenger_km,
        },
        "baseline": {
            "mode": BASELINE_MODE,
            "mode_name": baseline_name,
            "factor_kgco2e_per_km": baseline_factor,
            "factor_basis": baseline_basis,
            "emissions_kgco2e_per_week": round(baseline_kg, 3),
        },
        "selected": {
            "mode": mode,
            "mode_name": mode_name,
            "factor_kgco2e_per_km": factor,
            "factor_basis": factor_basis,
            "emissions_kgco2e_per_week": round(selected_kg, 3),
        },
        "net_reduction_kgco2e_per_week": round(baseline_kg - selected_kg, 3),
    }
