"""Оптимизация портфеля по Марковицу: 4 режима, эффективная граница, Monte-Carlo.

Все входы — доходности за период в долях (не в процентах), уже скорректированные
на инфляцию. Оптимизация ведётся в аннуализированных величинах:
    mu_a  = mu_period * periods_per_year
    cov_a = cov_period * periods_per_year
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from enum import Enum

import numpy as np
from scipy.optimize import minimize

log = logging.getLogger("portfolio.optimizer")

SHORT_BOUND = 1.0  # при разрешённых шортах |w_i| <= 1
TOL = 1e-9


def _p(x: float) -> str:
    """Процент в русской записи: 0.0455 → '4,55%'."""
    return f"{x * 100:.2f}".replace(".", ",") + "%"


class Mode(str, Enum):
    MIN_VOL = "min_vol"
    MAX_SHARPE = "max_sharpe"
    EFFICIENT_RISK = "efficient_risk"      # min риск при заданной доходности
    EFFICIENT_RETURN = "efficient_return"  # max доходность при заданной волатильности


class OptimizationError(ValueError):
    """Задача недопустима или солвер не сошёлся — сообщение показывается пользователю."""


@dataclass
class Inputs:
    mu: np.ndarray   # аннуализированные ожидаемые доходности, shape (n,)
    cov: np.ndarray  # аннуализированная ковариация, shape (n, n)
    allow_short: bool = False

    @property
    def n(self) -> int:
        return len(self.mu)

    @property
    def bounds(self):
        lo = -SHORT_BOUND if self.allow_short else 0.0
        return [(lo, 1.0)] * self.n


def make_inputs(returns: np.ndarray, periods_per_year: int, allow_short: bool = False) -> Inputs:
    """returns: матрица T×n доходностей за период (доли)."""
    r = np.asarray(returns, dtype=float)
    mu = r.mean(axis=0) * periods_per_year
    cov = np.cov(r, rowvar=False, ddof=1) * periods_per_year
    return Inputs(mu=mu, cov=cov, allow_short=allow_short)


def port_return(w, inp: Inputs) -> float:
    return float(w @ inp.mu)


def port_vol(w, inp: Inputs) -> float:
    return float(np.sqrt(max(w @ inp.cov @ w, 0.0)))


def sharpe(w, inp: Inputs, rf: float) -> float:
    v = port_vol(w, inp)
    return (port_return(w, inp) - rf) / v if v > 0 else float("nan")


# ---------------------------------------------------------------------------
_SUM_TO_ONE = {"type": "eq", "fun": lambda w: np.sum(w) - 1.0, "jac": lambda w: np.ones_like(w)}


def _solve(objective, inp: Inputs, extra_constraints=(), starts=None, jac=None) -> np.ndarray:
    constraints = [_SUM_TO_ONE, *extra_constraints]
    if starts is None:
        starts = [np.full(inp.n, 1.0 / inp.n)]
    best, best_val = None, np.inf
    for x0 in starts:
        res = minimize(objective, x0, jac=jac, method="SLSQP", bounds=inp.bounds,
                       constraints=constraints, options={"maxiter": 1000, "ftol": 1e-12})
        if not res.success:
            continue
        ok = all(
            (abs(c["fun"](res.x)) < 1e-6) if c["type"] == "eq" else (c["fun"](res.x) > -1e-6)
            for c in constraints
        )
        if ok and res.fun < best_val:
            best, best_val = res.x, res.fun
    if best is None:
        raise OptimizationError("Солвер не нашёл допустимого решения — проверьте ограничения.")
    w = np.where(np.abs(best) < 1e-8, 0.0, best)
    return w / w.sum()


def _starts(inp: Inputs, k: int = 6, seed: int = 0):
    rng = np.random.default_rng(seed)
    return [np.full(inp.n, 1.0 / inp.n), *rng.dirichlet(np.ones(inp.n), size=k - 1)]


def min_volatility(inp: Inputs) -> np.ndarray:
    return _solve(lambda w: w @ inp.cov @ w, inp, jac=lambda w: 2 * inp.cov @ w)


def max_sharpe(inp: Inputs, rf: float) -> np.ndarray:
    """Касательный портфель. Если все μ_i ≤ r_f, премия за риск отрицательна и максимум
    Шарпа — «наименее плохой» портфель; API добавляет об этом предупреждение."""
    def neg_sharpe(w):
        v = np.sqrt(max(w @ inp.cov @ w, 1e-16))
        return -(w @ inp.mu - rf) / v

    return _solve(neg_sharpe, inp, starts=_starts(inp))


def sharpe_warning(inp: Inputs, rf: float) -> str | None:
    if not inp.allow_short and np.max(inp.mu) <= rf:
        return (f"Ни один индикатор не обгоняет r_f ({_p(rf)} реальных): лучшая реальная доходность "
                f"{_p(np.max(inp.mu))}. Максимальный Шарп отрицателен — это наименее убыточный "
                f"по соотношению риск/доходность портфель, а не касательный.")
    return None


def return_range(inp: Inputs) -> tuple[float, float]:
    """Достижимый диапазон доходности на эффективной границе: [доходность min-vol, max]."""
    lo = port_return(min_volatility(inp), inp)
    if inp.allow_short:
        hi = port_return(_solve(lambda w: -(w @ inp.mu), inp, jac=lambda w: -inp.mu), inp)
    else:
        hi = float(np.max(inp.mu))
    return lo, hi


def efficient_risk(inp: Inputs, target_return: float) -> np.ndarray:
    """min wᵀΣw при wᵀμ = target_return."""
    lo_any = float(np.min(inp.mu)) if not inp.allow_short else -np.inf
    _, hi = return_range(inp)
    if target_return > hi + 1e-9 or target_return < lo_any - 1e-9:
        raise OptimizationError(
            f"Целевая доходность {_p(target_return)} недостижима. "
            f"Допустимо до {_p(hi)} годовых (реальных)."
        )
    con = {"type": "eq", "fun": lambda w: w @ inp.mu - target_return, "jac": lambda w: inp.mu}
    return _solve(lambda w: w @ inp.cov @ w, inp, [con], starts=_starts(inp), jac=lambda w: 2 * inp.cov @ w)


def efficient_return(inp: Inputs, target_vol: float) -> np.ndarray:
    """max wᵀμ при √(wᵀΣw) = target_vol.

    Равенство по волатильности невыпукло; на эффективной (верхней) ветви оно
    эквивалентно ограничению ≤, которое и используется. Если target_vol выше
    волатильности портфеля максимальной доходности, ограничение не активно.
    """
    w_min = min_volatility(inp)
    vmin = port_vol(w_min, inp)
    if target_vol < vmin - 1e-9:
        raise OptimizationError(
            f"Целевая волатильность {_p(target_vol)} ниже минимально возможной {_p(vmin)}."
        )
    con = {"type": "ineq", "fun": lambda w: target_vol**2 - w @ inp.cov @ w,
           "jac": lambda w: -2 * inp.cov @ w}
    return _solve(lambda w: -(w @ inp.mu), inp, [con], starts=[w_min, *_starts(inp)],
                  jac=lambda w: -inp.mu)


def optimize(inp: Inputs, mode: Mode, rf: float = 0.05, target_return: float | None = None,
             target_vol: float | None = None) -> np.ndarray:
    log.info("optimize mode=%s rf=%s target_return=%s target_vol=%s short=%s",
             mode, rf, target_return, target_vol, inp.allow_short)
    if mode == Mode.MIN_VOL:
        w = min_volatility(inp)
    elif mode == Mode.MAX_SHARPE:
        w = max_sharpe(inp, rf)
    elif mode == Mode.EFFICIENT_RISK:
        if target_return is None:
            raise OptimizationError("Для режима «Эффективный риск» укажите целевую доходность.")
        w = efficient_risk(inp, target_return)
    elif mode == Mode.EFFICIENT_RETURN:
        if target_vol is None:
            raise OptimizationError("Для режима «Эффективная доходность» укажите целевую волатильность.")
        w = efficient_return(inp, target_vol)
    else:  # pragma: no cover
        raise OptimizationError(f"Неизвестный режим {mode}")
    log.info("result weights=%s ret=%.4f vol=%.4f", np.round(w, 4).tolist(),
             port_return(w, inp), port_vol(w, inp))
    return w


# ---------------------------------------------------------------------------
def efficient_frontier(inp: Inputs, n_points: int = 40) -> list[dict]:
    lo, hi = return_range(inp)
    pts = []
    for target in np.linspace(lo, hi, n_points):
        try:
            w = efficient_risk(inp, float(target)) if target > lo + 1e-10 else min_volatility(inp)
        except OptimizationError:
            continue
        pts.append({"ret": port_return(w, inp), "vol": port_vol(w, inp), "weights": w.tolist()})
    return pts


def monte_carlo(inp: Inputs, rf: float, n: int = 5000, seed: int = 42) -> list[dict]:
    rng = np.random.default_rng(seed)
    if inp.allow_short:
        w = rng.normal(size=(n * 3, inp.n))
        w = w / w.sum(axis=1, keepdims=True)
        w = w[np.all(np.abs(w) <= SHORT_BOUND, axis=1)][:n]
    else:
        w = rng.dirichlet(np.ones(inp.n) * 0.7, size=n)
    rets = w @ inp.mu
    vols = np.sqrt(np.einsum("ij,jk,ik->i", w, inp.cov, w))
    sh = (rets - rf) / vols
    return [{"ret": float(r), "vol": float(v), "sharpe": float(s)} for r, v, s in zip(rets, vols, sh)]
