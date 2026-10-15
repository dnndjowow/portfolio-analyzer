import logging
from dataclasses import dataclass
from enum import Enum

import numpy as np
from scipy.optimize import minimize


logger = logging.getLogger('portfolio.optimizer')
TOL = 1e-7


class Mode(str, Enum):
    MIN_VOL = 'min_vol'
    MAX_SHARPE = 'max_sharpe'
    EFFICIENT_RISK = 'efficient_risk'
    EFFICIENT_RETURN = 'efficient_return'


class OptimizationError(ValueError):
    pass


@dataclass
class Inputs:
    # Годовая ожидаемая доходность и ковариационная матрица.
    mu: np.ndarray
    cov: np.ndarray

    @property
    def n(self) -> int:
        return len(self.mu)

    @property
    def bounds(self):
        return [(0.0, 1.0)] * self.n


def _format_percent(value: float) -> str:
    return f'{value * 100:.2f}'.replace('.', ',') + '%'


def make_inputs(
    returns: np.ndarray,
    periods_per_year: int,
) -> Inputs:
    returns_array = np.asarray(returns, dtype=float)
    expected_returns = returns_array.mean(axis=0) * periods_per_year
    covariance_matrix = np.cov(returns_array, rowvar=False, ddof=1) * periods_per_year

    return Inputs(
        mu=expected_returns,
        cov=covariance_matrix,
    )


def port_return(weights, portfolio_inputs: Inputs) -> float:
    return float(weights @ portfolio_inputs.mu)


def port_vol(weights, portfolio_inputs: Inputs) -> float:
    portfolio_variance = weights @ portfolio_inputs.cov @ weights

    return float(np.sqrt(max(portfolio_variance, 0.0)))


def sharpe(weights, portfolio_inputs: Inputs, risk_free: float) -> float:
    volatility = port_vol(weights, portfolio_inputs)

    if volatility <= 0:
        return float('nan')

    return (port_return(weights, portfolio_inputs) - risk_free) / volatility


_SUM_TO_ONE = {
    'type': 'eq',
    'fun': lambda weights: np.sum(weights) - 1.0,
    'jac': lambda weights: np.ones_like(weights),
}


def _solve(
    objective,
    portfolio_inputs: Inputs,
    extra_constraints=(),
    starts=None,
    jac=None,
) -> np.ndarray:
    constraints = [_SUM_TO_ONE, *extra_constraints]

    if starts is None:
        starts = [np.full(portfolio_inputs.n, 1.0 / portfolio_inputs.n)]

    best_weights = None
    best_objective = np.inf

    for initial_weights in starts:
        result = minimize(
            objective,
            initial_weights,
            jac=jac,
            method='SLSQP',
            bounds=portfolio_inputs.bounds,
            constraints=constraints,
            options={'maxiter': 1000, 'ftol': 1e-12},
        )

        if not result.success:
            continue

        if not np.isfinite(result.x).all() or np.any(result.x < -TOL) or np.any(result.x > 1 + TOL):
            continue
        candidate_weights = np.clip(result.x, 0.0, 1.0)
        candidate_weights /= candidate_weights.sum()
        constraints_satisfied = True

        for constraint in constraints:
            constraint_value = constraint['fun'](candidate_weights)

            if constraint['type'] == 'eq':
                constraint_satisfied = abs(constraint_value) <= TOL
            else:
                constraint_satisfied = constraint_value >= -TOL

            if not constraint_satisfied:
                constraints_satisfied = False
                break

        if constraints_satisfied and result.fun < best_objective:
            best_weights = candidate_weights
            best_objective = objective(candidate_weights)

    if best_weights is None:
        raise OptimizationError('Солвер не нашёл допустимого решения — проверьте ограничения.')

    return best_weights


def _starts(portfolio_inputs: Inputs, k: int = 6, seed: int = 0):
    random_generator = np.random.default_rng(seed)
    equal_weights = np.full(portfolio_inputs.n, 1.0 / portfolio_inputs.n)
    random_weights = random_generator.dirichlet(
        np.ones(portfolio_inputs.n),
        size=k - 1,
    )

    return [equal_weights, *random_weights]


def min_volatility(portfolio_inputs: Inputs) -> np.ndarray:
    scale = max(float(np.max(np.diag(portfolio_inputs.cov))), 1e-12)
    return _solve(
        lambda weights: weights @ portfolio_inputs.cov @ weights / scale,
        portfolio_inputs,
        jac=lambda weights: 2 * portfolio_inputs.cov @ weights / scale,
    )


def max_sharpe(portfolio_inputs: Inputs, risk_free: float) -> np.ndarray:
    def negative_sharpe(weights):
        variance = weights @ portfolio_inputs.cov @ weights
        volatility = np.sqrt(max(variance, 1e-16))
        excess_return = weights @ portfolio_inputs.mu - risk_free

        return -excess_return / volatility

    return _solve(
        negative_sharpe,
        portfolio_inputs,
        starts=_starts(portfolio_inputs),
    )


def sharpe_warning(portfolio_inputs: Inputs, risk_free: float) -> str | None:
    if np.max(portfolio_inputs.mu) <= risk_free:
        return (
            f'Ни один индикатор не обгоняет r_f ({_format_percent(risk_free)} реальных): '
            f'лучшая реальная доходность {_format_percent(np.max(portfolio_inputs.mu))}. '
            'Максимальный Шарп отрицателен — это наименее убыточный '
            'по соотношению риск/доходность портфель, а не касательный.'
        )

    return None


def return_range(portfolio_inputs: Inputs) -> tuple[float, float]:
    minimum_return = port_return(min_volatility(portfolio_inputs), portfolio_inputs)
    return minimum_return, float(np.max(portfolio_inputs.mu))


def _extreme_return_weights(portfolio_inputs: Inputs, maximum: bool = True) -> np.ndarray:
    extreme = np.max(portfolio_inputs.mu) if maximum else np.min(portfolio_inputs.mu)
    indices = np.flatnonzero(np.abs(portfolio_inputs.mu - extreme) <= 1e-12)
    weights = np.zeros(portfolio_inputs.n)
    if len(indices) == 1:
        weights[indices[0]] = 1.0
    else:
        sub_inputs = Inputs(portfolio_inputs.mu[indices], portfolio_inputs.cov[np.ix_(indices, indices)])
        weights[indices] = min_volatility(sub_inputs)
    return weights


def efficient_risk(portfolio_inputs: Inputs, target_return: float, starts=None) -> np.ndarray:
    minimum_return = float(np.min(portfolio_inputs.mu))
    maximum_return = float(np.max(portfolio_inputs.mu))
    if not np.isfinite(target_return) or not minimum_return - 1e-9 <= target_return <= maximum_return + 1e-9:
        raise OptimizationError(
            f'Целевая доходность {_format_percent(target_return)} недостижима. '
            f'Допустимо от {_format_percent(minimum_return)} до {_format_percent(maximum_return)}.'
        )
    if abs(target_return - maximum_return) <= 1e-12:
        return _extreme_return_weights(portfolio_inputs)
    if abs(target_return - minimum_return) <= 1e-12:
        return _extreme_return_weights(portfolio_inputs, maximum=False)
    return_constraint = {
        'type': 'eq',
        'fun': lambda weights: weights @ portfolio_inputs.mu - target_return,
        'jac': lambda weights: portfolio_inputs.mu,
    }
    scale = max(float(np.max(np.diag(portfolio_inputs.cov))), 1e-12)
    if starts is None:
        fraction = (target_return - minimum_return) / (maximum_return - minimum_return)
        feasible = (1 - fraction) * _extreme_return_weights(portfolio_inputs, False)
        feasible += fraction * _extreme_return_weights(portfolio_inputs)
        starts = [feasible, *_starts(portfolio_inputs)]
    return _solve(
        lambda weights: weights @ portfolio_inputs.cov @ weights / scale,
        portfolio_inputs,
        [return_constraint],
        starts=starts,
        jac=lambda weights: 2 * portfolio_inputs.cov @ weights / scale,
    )


def efficient_return(portfolio_inputs: Inputs, target_vol: float) -> np.ndarray:
    minimum_volatility_weights = min_volatility(portfolio_inputs)
    minimum_volatility = port_vol(minimum_volatility_weights, portfolio_inputs)

    if target_vol < minimum_volatility - 1e-9:
        raise OptimizationError(
            f'Целевая волатильность {_format_percent(target_vol)} '
            f'ниже минимально возможной {_format_percent(minimum_volatility)}.'
        )

    # Ограничение ≤ сохраняет выпуклость допустимой области.
    volatility_constraint = {
        'type': 'ineq',
        'fun': lambda weights: target_vol**2 - weights @ portfolio_inputs.cov @ weights,
        'jac': lambda weights: -2 * portfolio_inputs.cov @ weights,
    }

    return _solve(
        lambda weights: -(weights @ portfolio_inputs.mu),
        portfolio_inputs,
        [volatility_constraint],
        starts=[minimum_volatility_weights, *_starts(portfolio_inputs)],
        jac=lambda weights: -portfolio_inputs.mu,
    )


def optimize(
    portfolio_inputs: Inputs,
    mode: Mode,
    risk_free: float = 0.05,
    target_return: float | None = None,
    target_vol: float | None = None,
) -> np.ndarray:
    logger.info(
        'optimize mode=%s rf=%s target_return=%s target_vol=%s',
        mode,
        risk_free,
        target_return,
        target_vol,
    )

    if mode == Mode.MIN_VOL:
        portfolio_weights = min_volatility(portfolio_inputs)

    elif mode == Mode.MAX_SHARPE:
        portfolio_weights = max_sharpe(portfolio_inputs, risk_free)

    elif mode == Mode.EFFICIENT_RISK:
        if target_return is None:
            raise OptimizationError('Для режима «Эффективный риск» укажите целевую доходность.')

        portfolio_weights = efficient_risk(portfolio_inputs, target_return)

    elif mode == Mode.EFFICIENT_RETURN:
        if target_vol is None:
            raise OptimizationError('Для режима «Эффективная доходность» укажите целевую волатильность.')

        portfolio_weights = efficient_return(portfolio_inputs, target_vol)

    else:
        raise OptimizationError(f'Неизвестный режим {mode}')

    logger.info(
        'result weights=%s ret=%.4f vol=%.4f',
        np.round(portfolio_weights, 4).tolist(),
        port_return(portfolio_weights, portfolio_inputs),
        port_vol(portfolio_weights, portfolio_inputs),
    )

    return portfolio_weights


def _point(weights: np.ndarray, portfolio_inputs: Inputs) -> dict:
    return {
        'ret': port_return(weights, portfolio_inputs),
        'vol': port_vol(weights, portfolio_inputs),
        'weights': weights.tolist(),
    }


def efficient_frontier(portfolio_inputs: Inputs, n_points: int = 40) -> list[dict]:
    minimum_weights = min_volatility(portfolio_inputs)
    minimum_return = port_return(minimum_weights, portfolio_inputs)
    maximum_return = float(np.max(portfolio_inputs.mu))
    points = [_point(minimum_weights, portfolio_inputs)]
    if maximum_return - minimum_return <= 1e-12:
        return points
    previous_weights = minimum_weights
    maximum_weights = _extreme_return_weights(portfolio_inputs)
    for target in np.linspace(minimum_return, maximum_return, n_points)[1:]:
        previous_return = port_return(previous_weights, portfolio_inputs)
        fraction = (target - previous_return) / (maximum_return - previous_return)
        feasible = (1 - fraction) * previous_weights + fraction * maximum_weights
        try:
            weights = efficient_risk(portfolio_inputs, float(target), starts=[feasible])
        except OptimizationError:
            # Повторяем с несколькими стартами, а не пропускаем кусок границы.
            weights = efficient_risk(portfolio_inputs, float(target))
        points.append(_point(weights, portfolio_inputs))
        previous_weights = weights
    return points


def refine_frontier(portfolio_inputs: Inputs, frontier: list[dict], cloud: list[dict]) -> list[dict]:
    """Уточнить дискретную линию там, где её хорда пересекает допустимое облако.

    Оптимальная кривая выпукла в координатах (доходность, риск). Хорда может
    иметь риск выше облака, хотя каждый её узел оптимален. Добавляем истинный
    оптимум для соответствующей доходности до совпадения в пределах TOL.
    """
    points = sorted(frontier, key=lambda point: point['ret'])
    if len(points) < 2:
        return points
    returns = np.array([point['ret'] for point in cloud])
    vols = np.array([point['vol'] for point in cloud])
    in_range = (returns > points[0]['ret']) & (returns < points[-1]['ret'])
    sample_weights = np.array([point['weights'] for point in cloud])[in_range]
    returns, vols = returns[in_range], vols[in_range]
    while returns.size:
        interpolated = np.interp(returns, [p['ret'] for p in points], [p['vol'] for p in points])
        gaps = interpolated - vols
        worst = int(np.argmax(gaps))
        if gaps[worst] <= TOL:
            break
        target = float(returns[worst])
        try:
            weights = efficient_risk(portfolio_inputs, target, starts=[sample_weights[worst]])
        except OptimizationError:
            weights = efficient_risk(portfolio_inputs, target)
        point = _point(weights, portfolio_inputs)
        if point['vol'] > vols[worst] + TOL:
            raise OptimizationError('Не удалось согласовать эффективную границу с допустимыми портфелями.')
        points.append(point)
        points.sort(key=lambda p: p['ret'])
        # Этот образец проверен оптимизатором; исключаем повтор из-за округления.
        sample_weights = np.delete(sample_weights, worst, axis=0)
        returns = np.delete(returns, worst)
        vols = np.delete(vols, worst)
    return points


def monte_carlo(
    portfolio_inputs: Inputs,
    risk_free: float,
    n: int = 5000,
    seed: int = 42,
    frontier: list[dict] | None = None,
) -> list[dict]:
    random_generator = np.random.default_rng(seed)
    # Оба распределения лежат в симплексе: wi >= 0, сумма = 1.
    # Разреженная половина лучше покрывает портфели около вершин/граней.
    weights = np.vstack([
        random_generator.dirichlet(np.full(portfolio_inputs.n, 0.7), size=n // 2),
        random_generator.dirichlet(np.full(portfolio_inputs.n, 0.15), size=n - n // 2),
    ])
    expected_returns = weights @ portfolio_inputs.mu
    variances = np.einsum('ij,jk,ik->i', weights, portfolio_inputs.cov, weights)
    volatilities = np.sqrt(np.maximum(variances, 0.0))
    ratios = np.divide(
        expected_returns - risk_free, volatilities,
        out=np.zeros_like(expected_returns), where=volatilities > 0,
    )
    cloud = [
        {'ret': float(ret), 'vol': float(vol), 'sharpe': float(ratio), 'weights': w.tolist()}
        for ret, vol, ratio, w in zip(expected_returns, volatilities, ratios, weights)
    ]
    if frontier:
        # Сохраняем именно координаты узлов, без повторного округления матричным BLAS.
        for point in frontier:
            ratio = sharpe(np.asarray(point['weights']), portfolio_inputs, risk_free)
            cloud.append({**point, 'sharpe': ratio if np.isfinite(ratio) else 0.0})
    return cloud
