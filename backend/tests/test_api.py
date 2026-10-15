import pathlib

import numpy as np
import pytest
from fastapi.testclient import TestClient

from main import app

client = TestClient(app)
SAMPLE = pathlib.Path(__file__).with_name("sample.xlsx")


def _upload():
    with SAMPLE.open("rb") as f:
        r = client.post("/api/upload", files={"file": ("бизнес теория.xlsx", f)})
    assert r.status_code == 200, r.text
    return r.json()


def test_upload_parses_sample():
    js = _upload()
    ds = js["dataset"]
    assert len(ds["columns"]) == 10 and ds["columns"][0] == "Индикатор 1"
    assert js["n_obs"] == 30  # строки 3–32
    assert js["suggested_units"] == "percent"
    assert js["warnings"] == []


def test_all_modes_on_sample():
    ds = _upload()["dataset"]
    base = {"returns": ds, "risk_free": 0.05}
    for mode, extra in [("min_vol", {}), ("max_sharpe", {}),
                        ("efficient_risk", {"target_return": -0.06}),
                        ("efficient_return", {"target_vol": 0.08})]:
        r = client.post("/api/optimize", json={**base, "mode": mode, **extra})
        assert r.status_code == 200, (mode, r.text)
        assert abs(sum(r.json()["weights"]) - 1) < 1e-6


def test_frontier_and_compare_and_export():
    ds = _upload()["dataset"]
    r = client.post("/api/efficient-frontier", json={"returns": ds, "risk_free": 0.0, "n_samples": 500})
    assert r.status_code == 200 and len(r.json()["cloud"]) >= 500 + len(r.json()["frontier"])
    ports = [{"name": "Равные", "weights": [0.1] * 10}, {"name": "MV", "weights": r.json()["min_vol"]["weights"]}]
    c = client.post("/api/compare", json={"returns": ds, "portfolios": ports})
    assert c.status_code == 200 and len(c.json()["series"]) == 2
    e = client.post("/api/export", json={"returns": ds, "portfolios": ports})
    assert e.status_code == 200 and e.content[:2] == b"PK"


def test_validation_rejects_short_series():
    ds = _upload()["dataset"]
    ds["data"], ds["index"] = ds["data"][:10], ds["index"][:10]
    r = client.post("/api/optimize", json={"returns": ds, "mode": "min_vol"})
    assert r.status_code == 422 and "30" in r.json()["detail"]


def test_negative_premium_warns_not_fails():
    ds = _upload()["dataset"]
    r = client.post("/api/optimize", json={"returns": ds, "mode": "max_sharpe", "risk_free": 0.05})
    assert r.status_code == 200
    js = r.json()
    assert js["risk_free_real"] < 0.05  # r_f пересчитана в реальную
    assert any("обгоняет" in w for w in js["warnings"])


@pytest.mark.parametrize("endpoint,extra", [
    ("optimize", {"mode": "min_vol"}),
    ("efficient-frontier", {}),
    ("portfolio/metrics", {"weights": [0.1] * 10}),
    ("compare", {"portfolios": [{"name": "P", "weights": [0.1] * 10}]}),
    ("export", {"portfolios": [{"name": "P", "weights": [0.1] * 10}]}),
])
def test_api_rejects_request_to_enable_short_selling(endpoint, extra):
    response = client.post(f"/api/{endpoint}", json={"returns": _upload()["dataset"], "allow_short": True, **extra})
    assert response.status_code == 422


@pytest.mark.parametrize("endpoint", ["portfolio/metrics", "compare", "export"])
@pytest.mark.parametrize("negative", [-0.1, -1e-12])
def test_api_rejects_negative_weights(endpoint, negative):
    weights = [negative, 0.2 - negative, *([0.1] * 8)]
    extra = {"weights": weights} if endpoint == "portfolio/metrics" else {"portfolios": [{"name": "P", "weights": weights}]}
    response = client.post(f"/api/{endpoint}", json={"returns": _upload()["dataset"], **extra})
    assert response.status_code == 422
    assert "Короткие продажи запрещены" in response.json()["detail"]


@pytest.mark.parametrize("name", ["M2", "M2RU", "M²", "Modigliani-Modigliani", "Модильяни–Модильяни"])
def test_excluded_indicator_cannot_enter_calculations(name):
    dataset = _upload()["dataset"]
    dataset["columns"][0] = name
    response = client.post("/api/optimize", json={"returns": dataset, "mode": "min_vol"})
    assert response.status_code == 422


def test_frontier_points_belong_to_cloud_and_bound_it():
    response = client.post("/api/efficient-frontier", json={"returns": _upload()["dataset"], "n_points": 5, "n_samples": 1000})
    assert response.status_code == 200, response.text
    result = response.json()
    coordinates = {(p["ret"], p["vol"]) for p in result["cloud"]}
    for point in result["frontier"]:
        assert (point["ret"], point["vol"]) in coordinates
    for point in result["cloud"]:
        assert min(point["weights"]) >= 0
        assert abs(sum(point["weights"]) - 1) < 1e-12
    frontier = sorted(result["frontier"], key=lambda p: p["ret"])
    for point in result["cloud"]:
        if frontier[0]["ret"] <= point["ret"] <= frontier[-1]["ret"]:
            line_vol = np.interp(point["ret"], [p["ret"] for p in frontier], [p["vol"] for p in frontier])
            assert point["vol"] >= line_vol - 1e-7


def test_nine_assets_without_m2_are_supported():
    dataset = _upload()["dataset"]
    dataset["columns"] = dataset["columns"][:9]
    dataset["data"] = [row[:9] for row in dataset["data"]]
    response = client.post("/api/optimize", json={"returns": dataset, "mode": "min_vol"})
    assert response.status_code == 200, response.text
    assert len(response.json()["weights"]) == 9
    assert min(response.json()["weights"]) >= 0
    assert not any("m2" in key.lower() for key in response.json()["metrics"])
