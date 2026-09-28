import pathlib
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
    assert len(ds["columns"]) == 10 and ds["columns"][0] == "M2RU"
    assert js["n_obs"] == 30  # строки 3–32
    assert js["suggested_units"] == "percent"
    assert any("M2RU" in w for w in js["warnings"])


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
    assert r.status_code == 200 and len(r.json()["cloud"]) == 500
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
