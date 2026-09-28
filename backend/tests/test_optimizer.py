import numpy as np
import pytest

import optimizer as opt
from metrics import compute_metrics, max_recovery_period, max_drawdown

RF = 0.05


@pytest.fixture(scope="module")
def returns():
    rng = np.random.default_rng(7)
    mu = np.linspace(0.002, 0.012, 10)
    a = rng.normal(size=(10, 10)) * 0.01
    return rng.multivariate_normal(mu, a @ a.T + np.eye(10) * 1e-4, size=120)


@pytest.fixture(scope="module")
def inp(returns):
    return opt.make_inputs(returns, 12)


@pytest.mark.parametrize("mode,kw", [
    (opt.Mode.MIN_VOL, {}),
    (opt.Mode.MAX_SHARPE, {}),
    (opt.Mode.EFFICIENT_RISK, {"target_return": 0.08}),
    (opt.Mode.EFFICIENT_RETURN, {"target_vol": 0.12}),
])
def test_weights_valid_long_only(inp, mode, kw):
    w = opt.optimize(inp, mode, RF, **kw)
    assert w.shape == (10,)
    assert abs(w.sum() - 1) < 1e-6
    assert (w >= -1e-8).all()


def test_min_vol_below_max_sharpe(inp):
    wmv = opt.optimize(inp, opt.Mode.MIN_VOL)
    wms = opt.optimize(inp, opt.Mode.MAX_SHARPE, RF)
    assert opt.port_vol(wmv, inp) <= opt.port_vol(wms, inp) + 1e-9
    assert opt.sharpe(wms, inp, RF) >= opt.sharpe(wmv, inp, RF) - 1e-9


def test_max_sharpe_beats_random(inp):
    wms = opt.max_sharpe(inp, RF)
    best_mc = max(p["sharpe"] for p in opt.monte_carlo(inp, RF, 3000))
    assert opt.sharpe(wms, inp, RF) >= best_mc - 1e-6


def test_efficient_risk_hits_target(inp):
    w = opt.efficient_risk(inp, 0.08)
    assert abs(opt.port_return(w, inp) - 0.08) < 1e-6


def test_efficient_return_respects_vol(inp):
    w = opt.efficient_return(inp, 0.12)
    assert opt.port_vol(w, inp) <= 0.12 + 1e-6


def test_infeasible_targets_raise(inp):
    with pytest.raises(opt.OptimizationError):
        opt.efficient_risk(inp, 5.0)
    with pytest.raises(opt.OptimizationError):
        opt.efficient_return(inp, 1e-5)


def test_shorts_allowed(inp):
    short = opt.make_inputs(np.zeros(1), 1) if False else opt.Inputs(inp.mu, inp.cov, allow_short=True)
    w = opt.min_volatility(short)
    assert abs(w.sum() - 1) < 1e-6
    assert opt.port_vol(w, short) <= opt.port_vol(opt.min_volatility(inp), inp) + 1e-9


def test_frontier_monotone(inp):
    pts = opt.efficient_frontier(inp, 15)
    rets = [p["ret"] for p in pts]
    vols = [p["vol"] for p in pts]
    assert rets == sorted(rets)
    assert all(b >= a - 1e-6 for a, b in zip(vols, vols[1:]))


def test_drawdown_and_recovery():
    curve = np.array([100, 110, 99, 105, 111, 90, 95])
    assert abs(max_drawdown(curve)["value"] - (90 / 111 - 1)) < 1e-12
    rec = max_recovery_period(curve)
    # 110 (t=1) восстановлен на t=4 → 3 периода; 111 (t=4) не восстановлен к t=6 → 2
    assert rec == {"periods": 3, "start_index": 1, "end_index": 4, "recovered": True}


def test_metrics_keys(returns):
    m = compute_metrics(returns, np.full(10, 0.1), 12, RF)
    for k in ("expected_return", "volatility", "max_drawdown", "max_recovery_periods", "sharpe"):
        assert k in m
    assert len(m["curve"]) == len(returns) + 1
