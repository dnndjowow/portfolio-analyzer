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
    assert (w >= 0).all()


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


def test_long_only_constraint_changes_unconstrained_solution():
    # Без ограничения оптимум для этой матрицы имеет отрицательный вес второго актива.
    inputs = opt.Inputs(np.array([0.05, 0.10]), np.array([[0.01, 0.015], [0.015, 0.04]]))
    inverse = np.linalg.inv(inputs.cov)
    unconstrained = inverse @ np.ones(2) / (np.ones(2) @ inverse @ np.ones(2))
    assert unconstrained[1] < 0
    weights = opt.min_volatility(inputs)
    assert (weights >= 0).all()
    assert np.allclose(weights, [1, 0], atol=1e-7)


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


def test_cloud_uses_same_statistics_and_nonnegative_weights(inp):
    for point in opt.monte_carlo(inp, RF, 300):
        weights = np.asarray(point["weights"])
        assert (weights >= 0).all()
        assert weights.sum() == pytest.approx(1)
        assert point["ret"] == pytest.approx(opt.port_return(weights, inp))
        assert point["vol"] == pytest.approx(opt.port_vol(weights, inp))


def test_two_asset_curve_refinement_does_not_cut_through_cloud():
    inputs = opt.Inputs(np.array([0.04, 0.18]), np.diag([0.04, 0.09]))
    initial = opt.efficient_frontier(inputs, 5)
    cloud = opt.monte_carlo(inputs, 0, 300, frontier=initial)
    points = opt.refine_frontier(inputs, initial, cloud)
    assert len(points) > len(initial)
    for point in cloud:
        if points[0]["ret"] < point["ret"] < points[-1]["ret"]:
            interpolated = np.interp(point["ret"], [p["ret"] for p in points], [p["vol"] for p in points])
            assert point["vol"] >= interpolated - 1e-7
    for point in points:
        assert min(point["weights"]) >= 0
        assert opt.port_vol(np.array(point["weights"]), inputs) == pytest.approx(point["vol"])


def test_equal_returns_produce_single_efficient_point():
    inputs = opt.Inputs(np.array([0.1, 0.1]), np.diag([0.01, 0.04]))
    points = opt.efficient_frontier(inputs)
    assert len(points) == 1
    assert points[0]["ret"] == pytest.approx(0.1)
    assert points[0]["weights"] == pytest.approx([0.8, 0.2])


def test_highest_return_tie_uses_minimum_risk_combination():
    inputs = opt.Inputs(np.array([0.05, 0.2, 0.2]), np.diag([0.01, 0.04, 0.09]))
    point = opt.efficient_frontier(inputs, 5)[-1]
    assert point["ret"] == pytest.approx(0.2)
    assert point["weights"] == pytest.approx([0, 9 / 13, 4 / 13], abs=1e-7)
