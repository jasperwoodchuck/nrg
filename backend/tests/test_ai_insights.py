import pytest
from fastapi import HTTPException

from app.core.config import settings
from app.main import ai_insight
from app.modules.ai import insights


class MockGeminiResponse:
    def __init__(self, payload):
        self.payload = payload

    def raise_for_status(self):
        pass

    def json(self):
        return self.payload


def test_generate_grid_insight_uses_server_key_and_validates_text(monkeypatch):
    captured = {}

    class MockClient:
        def __init__(self, timeout):
            captured["timeout"] = timeout

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc_value, traceback):
            return None

        def post(self, url, *, headers, json):
            captured.update(url=url, headers=headers, body=json)
            return MockGeminiResponse({"candidates": [{"content": {"parts": [
                {"text": "internal reasoning", "thought": True},
                {"text": "Shift flexible use toward cleaner forecast hours."},
            ]}}]})

    monkeypatch.setattr(settings, "gemini_api_key", "test-key")
    monkeypatch.setattr(insights.httpx, "Client", MockClient)

    result = insights.generate_grid_insight({"forecast_hours_next_24h": 24})

    assert result == "Shift flexible use toward cleaner forecast hours."
    assert captured["url"] == insights.GEMINI_API_URL
    assert captured["headers"] == {"x-goog-api-key": "test-key"}
    assert "forecast_hours_next_24h" in captured["body"]["contents"][0]["parts"][0]["text"]


def test_generate_grid_insight_requires_key(monkeypatch):
    monkeypatch.setattr(settings, "gemini_api_key", None)

    with pytest.raises(insights.GeminiKeyMissingError):
        insights.generate_grid_insight({})


def test_generate_grid_insight_rejects_malformed_provider_output(monkeypatch):
    class MockClient:
        def __init__(self, timeout):
            pass

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc_value, traceback):
            return None

        def post(self, url, *, headers, json):
            return MockGeminiResponse({"candidates": []})

    monkeypatch.setattr(settings, "gemini_api_key", "test-key")
    monkeypatch.setattr(insights.httpx, "Client", MockClient)

    with pytest.raises(insights.GeminiInsightError, match="no candidate"):
        insights.generate_grid_insight({})


def test_ai_insight_endpoint_returns_503_without_key(api_db_session, monkeypatch):
    monkeypatch.setattr(settings, "gemini_api_key", None)

    with pytest.raises(HTTPException) as error:
        ai_insight(api_db_session)

    assert error.value.status_code == 503
    assert "GEMINI_API_KEY" in error.value.detail


def test_ai_insight_endpoint_uses_aggregated_facts(api_db_session, monkeypatch):
    captured = {}

    def generate(facts):
        captured.update(facts)
        return "The forecast data is available for analysis."

    monkeypatch.setattr("app.main.generate_grid_insight", generate)

    result = ai_insight(api_db_session)

    assert result["source"] == "GEMINI"
    assert result["insight"] == "The forecast data is available for analysis."
    assert "completed_simulated_loads" in captured
    assert "forecast_hours_next_24h" in captured
