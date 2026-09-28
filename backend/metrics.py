"""Метрики кривой доходности портфеля."""
from __future__ import annotations

import numpy as np


def portfolio_returns(returns: np.ndarray, weights: np.ndarray) -> np.ndarray:
    """Ряд доходностей портфеля за период (доли)."""
    return np.asarray(returns, dtype=float) @ np.asarray(weights, dtype=float)


def equity_curve(port_r: np.ndarray, start: float = 100.0) -> np.ndarray:
    """M_t = M_{t-1} * (1 + r_t); первая точка — стартовый капитал M_0."""
    return start * np.concatenate([[1.0], np.cumprod(1.0 + port_r)])


def max_drawdown(curve: np.ndarray) -> dict:
    peaks = np.maximum.accumulate(curve)
    dd = curve / peaks - 1.0
    trough = int(np.argmin(dd))
    peak = int(np.argmax(curve[: trough + 1])) if trough > 0 else 0
    return {"value": float(dd[trough]), "peak_index": peak, "trough_index": trough,
            "series": dd.tolist()}


def max_recovery_period(curve: np.ndarray) -> dict:
    """Самый длинный отрезок (в периодах) от пика до возврата кривой на уровень этого пика.

    Если к концу выборки кривая так и не восстановилась, отрезок считается до
    последней точки и помечается recovered=False.
    """
    best = {"periods": 0, "start_index": None, "end_index": None, "recovered": True}
    peak_val, peak_idx = curve[0], 0
    in_dd = False
    for t in range(1, len(curve)):
        if curve[t] >= peak_val:
            if in_dd and t - peak_idx > best["periods"]:
                best = {"periods": t - peak_idx, "start_index": peak_idx, "end_index": t, "recovered": True}
            peak_val, peak_idx, in_dd = curve[t], t, False
        else:
            in_dd = True
    last = len(curve) - 1
    if in_dd and last - peak_idx > best["periods"]:
        best = {"periods": last - peak_idx, "start_index": peak_idx, "end_index": last, "recovered": False}
    return best


def compute_metrics(returns: np.ndarray, weights: np.ndarray, periods_per_year: int,
                    rf: float = 0.05, start: float = 100.0) -> dict:
    pr = portfolio_returns(returns, weights)
    curve = equity_curve(pr, start)
    n = len(pr)
    exp_ret = float(pr.mean() * periods_per_year)                  # среднегодовая (арифм.)
    cagr = float((curve[-1] / curve[0]) ** (periods_per_year / n) - 1.0) if n else 0.0
    vol = float(pr.std(ddof=1) * np.sqrt(periods_per_year)) if n > 1 else 0.0
    mdd = max_drawdown(curve)
    rec = max_recovery_period(curve)
    return {
        "expected_return": exp_ret,
        "cagr": cagr,
        "volatility": vol,
        "sharpe": (exp_ret - rf) / vol if vol > 0 else None,
        "max_drawdown": mdd["value"],
        "max_drawdown_peak": mdd["peak_index"],
        "max_drawdown_trough": mdd["trough_index"],
        "max_recovery_periods": rec["periods"],
        "max_recovery_years": rec["periods"] / periods_per_year,
        "recovery_start": rec["start_index"],
        "recovery_end": rec["end_index"],
        "recovered": rec["recovered"],
        "curve": curve.tolist(),
        "drawdown": mdd["series"],
        "period_returns": pr.tolist(),
    }
