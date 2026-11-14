from app.modules.energy import region


def test_reverse_geocoding_returns_and_caches_only_an_indian_state(monkeypatch):
    calls = []

    class Response:
        def raise_for_status(self):
            return None

        def json(self):
            return {"address": {"country_code": "in", "state": "West Bengal"}}

    class Client:
        def __init__(self, **kwargs):
            assert kwargs["headers"]["User-Agent"] == region.NOMINATIM_USER_AGENT

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return None

        def get(self, url, params):
            calls.append((url, params))
            return Response()

    monkeypatch.setattr(region, "_cache", {})
    monkeypatch.setattr(region, "_last_request_at", 0.0)
    monkeypatch.setattr(region.httpx, "Client", Client)

    assert region.resolve_indian_state(22.57, 88.36) == "West Bengal"
    assert region.resolve_indian_state(22.57, 88.36) == "West Bengal"
    assert len(calls) == 1
    assert calls[0][0] == region.NOMINATIM_REVERSE_URL
    assert calls[0][1]["zoom"] == 5


def test_reverse_geocoding_rejects_non_indian_results():
    assert region._state_from_result({"address": {"country_code": "np", "state": "Province No. 1"}}) is None
    assert region._state_from_result({"address": {"country_code": "in"}}) is None
