import logging
from dataclasses import dataclass
from enum import Enum

import numpy as np
from scipy.optimize import minimize


logger = logging.getLogger('portfolio.optimizer')
SHORT_BOUND = 1.0
TOL = 1e-9


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
    allow_short: bool = False

    @property
    def n(self) -> int:
        return len(self.mu)

    @property
    def bounds(self):
        minimum_weight = 0.0
        if self.allow_short:
            minimum_weight = -SHORT_BOUND

        return [(minimum_weight, 1.0)] * self.n


def _format_percent(value: float) -> str:
    return f'{value * 100:.2f}'.replace('.', ',') + '%'


def make_inputs(
    returns: np.ndarray,
    periods_per_year: int,
    allow_short: bool = False,
) -> Inputs:
    returns_array = np.asarray(returns, dtype=float)
    expected_returns = returns_array.mean(axis=0) * periods_per_year
    covariance_matrix = np.cov(returns_array, rowvar=False, ddof=1) * periods_per_year

    return Inputs(
        mu=expected_returns,
        cov=covariance_matrix,
        allow_short=allow_short,
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

        constraints_satisfied = True

        for constraint in constraints:
            constraint_value = constraint['fun'](result.x)

            if constraint['type'] == 'eq':
                constraint_satisfied = abs(constraint_value) < 1e-6
            else:
                constraint_satisfied = constraint_value > -1e-6

            if not constraint_satisfied:
                constraints_satisfied = False
                break

        if constraints_satisfied and result.fun < best_objective:
            best_weights = result.x
            best_objective = result.fun

    if best_weights is None:
        raise OptimizationError('Солвер не нашёл допустимого решения — проверьте ограничения.')

    # Убираем численный шум и восстанавливаем сумму весов после округления.
    portfolio_weights = np.where(np.abs(best_weights) < 1e-8, 0.0, best_weights)

    return portfolio_weights / portfolio_weights.sum()


def _starts(portfolio_inputs: Inputs, k: int = 6, seed: int = 0):
    random_generator = np.random.default_rng(seed)
    equal_weights = np.full(portfolio_inputs.n, 1.0 / portfolio_inputs.n)
    random_weights = random_generator.dirichlet(
        np.ones(portfolio_inputs.n),
        size=k - 1,
    )

    return [equal_weights, *random_weights]


def min_volatility(portfolio_inputs: Inputs) -> np.ndarray:
    return _solve(
        lambda weights: weights @ portfolio_inputs.cov @ weights,
        portfolio_inputs,
        jac=lambda weights: 2 * portfolio_inputs.cov @ weights,
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
    if not portfolio_inputs.allow_short and np.max(portfolio_inputs.mu) <= risk_free:
        return (
            f'Ни один индикатор не обгоняет r_f ({_format_percent(risk_free)} реальных): '
            f'лучшая реальная доходность {_format_percent(np.max(portfolio_inputs.mu))}. '
            'Максимальный Шарп отрицателен — это наименее убыточный '
            'по соотношению риск/доходность портфель, а не касательный.'
        )

    return None


def return_range(portfolio_inputs: Inputs) -> tuple[float, float]:
    minimum_return = port_return(min_volatility(portfolio_inputs), portfolio_inputs)

    if portfolio_inputs.allow_short:
        maximum_return_weights = _solve(
            lambda weights: -(weights @ portfolio_inputs.mu),
            portfolio_inputs,
            jac=lambda weights: -portfolio_inputs.mu,
        )
        maximum_return = port_return(maximum_return_weights, portfolio_inputs)
    else:
        maximum_return = float(np.max(portfolio_inputs.mu))

    return minimum_return, maximum_return


def efficient_risk(portfolio_inputs: Inputs, target_return: float) -> np.ndarray:
    minimum_asset_return = -np.inf
    if not portfolio_inputs.allow_short:
        minimum_asset_return = float(np.min(portfolio_inputs.mu))

    minimum_frontier_return, maximum_return = return_range(portfolio_inputs)

    if target_return > maximum_return + 1e-9 or target_return < minimum_asset_return - 1e-9:
        raise OptimizationError(
            f'Целевая доходность {_format_percent(target_return)} недостижима. '
            f'Допустимо до {_format_percent(maximum_return)} годовых (реальных).'
        )

    return_constraint = {
        'type': 'eq',
        'fun': lambda weights: weights @ portfolio_inputs.mu - target_return,
        'jac': lambda weights: portfolio_inputs.mu,
    }

    return _solve(
        lambda weights: weights @ portfolio_inputs.cov @ weights,
        portfolio_inputs,
        [return_constraint],
        starts=_starts(portfolio_inputs),
        jac=lambda weights: 2 * portfolio_inputs.cov @ weights,
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
        'optimize mode=%s rf=%s target_return=%s target_vol=%s short=%s',
        mode,
        risk_free,
        target_return,
        target_vol,
        portfolio_inputs.allow_short,
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


def efficient_frontier(portfolio_inputs: Inputs, n_points: int = 40) -> list[dict]:
    minimum_return, maximum_return = return_range(portfolio_inputs)
    frontier_points = []

    for target_return in np.linspace(minimum_return, maximum_return, n_points):
        try:
            if target_return > minimum_return + 1e-10:
                portfolio_weights = efficient_risk(portfolio_inputs, float(target_return))
            else:
                portfolio_weights = min_volatility(portfolio_inputs)

        except OptimizationError:
            continue

        frontier_points.append({
            'ret': port_return(portfolio_weights, portfolio_inputs),
            'vol': port_vol(portfolio_weights, portfolio_inputs),
            'weights': portfolio_weights.tolist(),
        })

    return frontier_points


def monte_carlo(
    portfolio_inputs: Inputs,
    risk_free: float,
    n: int = 5000,
    seed: int = 42,
) -> list[dict]:
    random_generator = np.random.default_rng(seed)

    if portfolio_inputs.allow_short:
        portfolio_weights = random_generator.normal(size=(n * 3, portfolio_inputs.n))
        portfolio_weights = portfolio_weights / portfolio_weights.sum(axis=1, keepdims=True)
        valid_weights = np.all(np.abs(portfolio_weights) <= SHORT_BOUND, axis=1)
        portfolio_weights = portfolio_weights[valid_weights][:n]
    else:
        portfolio_weights = random_generator.dirichlet(np.ones(portfolio_inputs.n) * 0.7, size=n)

    expected_returns = portfolio_weights @ portfolio_inputs.mu
    volatilities = np.sqrt(np.einsum(
        'ij,jk,ik->i',
        portfolio_weights,
        portfolio_inputs.cov,
        portfolio_weights,
    ))
    sharpe_ratios = (expected_returns - risk_free) / volatilities
    random_portfolios = []

    for expected_return, volatility, sharpe_ratio in zip(expected_returns, volatilities, sharpe_ratios):
        random_portfolios.append({
            'ret': float(expected_return),
            'vol': float(volatility),
            'sharpe': float(sharpe_ratio),
        })

    return random_portfolios
