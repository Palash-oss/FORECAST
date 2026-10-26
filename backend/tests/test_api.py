from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_endpoint():
    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["data_loaded"] is True
    assert data["actuals_count"] > 1000
    assert data["forecasts_count"] > 10000


def test_meta_endpoint():
    resp = client.get("/api/meta")
    assert resp.status_code == 200
    data = resp.json()
    assert "delivery_dates" in data
    assert "2026-01-15" in data["delivery_dates"]
    assert data["default_cutoff_time"] == "09:00"
    assert data["error_convention"].startswith("error = forecast - actual")


def test_decision_endpoint():
    resp = client.get(
        "/api/decision?delivery_date=2026-01-15&cutoff_time=09:00&confidence_level=0.90&demand_mw=25000"
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["delivery_date"] == "2026-01-15"
    assert data["cutoff_time"] == "09:00"
    assert data["buffer_mw"] > 0
    assert len(data["rows"]) == 48
    assert len(data["insights"]) >= 3

    first_row = data["rows"][0]
    assert first_row["period"] == 1
    assert "forecast_mw" in first_row
    assert "actual_mw" in first_row
    assert "residual_thermal_with_buffer" in first_row


def test_decision_invalid_date():
    resp = client.get("/api/decision?delivery_date=2025-05-01")
    assert resp.status_code == 400
    assert "delivery_date must be between" in resp.json()["detail"]


def test_accuracy_summary_endpoint():
    resp = client.get("/api/accuracy/summary?cutoff_time=09:00")
    assert resp.status_code == 200
    data = resp.json()
    assert data["mae"] > 0
    assert data["rmse"] > data["mae"]
    assert "shortfall_rate_pct" in data
    assert "shortfall_p90_mw" in data
    assert data["total_evaluated_half_hours"] > 1000


def test_accuracy_daily_endpoint():
    resp = client.get("/api/accuracy/daily?cutoff_time=09:00")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) >= 30  # 31 delivery days
    assert data[0]["total_periods"] == 48


def test_accuracy_by_hour_endpoint():
    resp = client.get("/api/accuracy/by-hour?cutoff_time=09:00")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 24
    assert data[0]["hour"] == 0
    assert data[23]["hour"] == 23


def test_accuracy_by_horizon_endpoint():
    resp = client.get("/api/accuracy/by-horizon?min_horizon=0&max_horizon=48")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["buckets"]) >= 3
    assert len(data["continuous"]) > 0
    assert "summary_insight" in data


def test_accuracy_distribution_endpoint():
    resp = client.get("/api/accuracy/distribution?cutoff_time=09:00&bins=30")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["histogram"]) > 0
    assert "quantiles" in data
    assert "p50" in data["quantiles"]
    assert "shortfall_quantiles" in data


def test_whatif_endpoint_get_and_post():
    # GET test
    resp_get = client.get("/api/whatif?delivery_date=2026-01-10&cutoff_time=09:00&demand_mw=26000")
    assert resp_get.status_code == 200
    d_get = resp_get.json()
    assert len(d_get["rows"]) == 48
    assert d_get["metrics"]["total_energy_demand_mwh"] == 26000 * 24  # 624,000 MWh

    # POST test with custom hourly profile
    custom_profile = [20000.0 + i * 200.0 for i in range(24)]
    resp_post = client.post(
        "/api/whatif",
        json={
            "delivery_date": "2026-01-10",
            "cutoff_time": "09:00",
            "confidence_level": 0.95,
            "hourly_demand_mw": custom_profile,
        },
    )
    assert resp_post.status_code == 200
    d_post = resp_post.json()
    assert d_post["confidence_level"] == 0.95
    assert len(d_post["rows"]) == 48
    assert len(d_post["insights"]) >= 3
