from fastapi.testclient import TestClient
from app.main import app


def test_endpoint_contracts():
    with TestClient(app) as client:
        for path in ("/api/v1/impact/summary", "/api/v1/impact/metrics/co2_saved", "/api/v1/forecast", "/api/v1/schedule", "/api/v1/loads", "/api/v1/insights", "/api/v1/reports/latest", "/api/v1/reports", "/api/v1/health"):
            response = client.get(path)
            assert response.status_code == 200, (path, response.text)
            assert isinstance(response.json(), dict)
        response = client.get("/api/v1/impact/metrics/nope")
        assert response.status_code == 404
        assert "error" in response.json()
        response = client.post("/api/v1/sim/control?action=stop")
        assert response.status_code == 200
