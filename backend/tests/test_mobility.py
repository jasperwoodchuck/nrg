import pytest
from pydantic import ValidationError

from app.main import MobilityEstimateInput, app, mobility_estimate
from app.modules.impact.mobility import estimate_weekly_mobility


@pytest.mark.parametrize(
    ("mode", "expected_emissions", "expected_reduction"),
    [
        ("petrol_car", 17.0, 0.0),
        ("electric_car", 5.0, 12.0),
        ("motorbike", 11.0, 6.0),
        ("local_bus", 10.0, 7.0),
        ("national_rail", 4.0, 13.0),
    ],
)
def test_weekly_mobility_estimate_uses_mode_factors(mode, expected_emissions, expected_reduction):
    result = estimate_weekly_mobility(10, 5, mode)

    assert result["inputs"]["round_trip_passenger_km_per_week"] == 100
    assert result["baseline"]["emissions_kgco2e_per_week"] == 17
    assert result["selected"]["emissions_kgco2e_per_week"] == expected_emissions
    assert result["net_reduction_kgco2e_per_week"] == expected_reduction
    assert result["source"] == "ESTIMATED"


def test_mobility_endpoint_is_registered_and_returns_factor_details():
    assert "/api/v1/mobility/estimate" in app.openapi()["paths"]

    result = mobility_estimate(
        MobilityEstimateInput(
            one_way_distance_km=8,
            commute_days_per_week=5,
            mode="local_bus",
        )
    )

    assert result["selected"]["factor_basis"] == "passenger-km"
    assert result["factor_source_url"].startswith("https://")


@pytest.mark.parametrize(
    "payload",
    [
        {"one_way_distance_km": 0, "commute_days_per_week": 5, "mode": "local_bus"},
        {"one_way_distance_km": 501, "commute_days_per_week": 5, "mode": "local_bus"},
        {"one_way_distance_km": 8, "commute_days_per_week": 0, "mode": "local_bus"},
        {"one_way_distance_km": 8, "commute_days_per_week": 8, "mode": "local_bus"},
        {"one_way_distance_km": 8, "commute_days_per_week": 5, "mode": "walking"},
        {"one_way_distance_km": float("inf"), "commute_days_per_week": 5, "mode": "local_bus"},
    ],
)
def test_mobility_request_rejects_invalid_inputs(payload):
    with pytest.raises(ValidationError):
        MobilityEstimateInput(**payload)
