import numpy as np


def portfolio_returns(returns: np.ndarray, weights: np.ndarray) -> np.ndarray:
    returns_array = np.asarray(returns, dtype=float)
    weights_array = np.asarray(weights, dtype=float)

    return returns_array @ weights_array


def equity_curve(period_returns: np.ndarray, start: float = 100.0) -> np.ndarray:
    cumulative_returns = np.cumprod(1.0 + period_returns)

    return start * np.concatenate([[1.0], cumulative_returns])


def max_drawdown(curve: np.ndarray) -> dict:
    previous_peaks = np.maximum.accumulate(curve)
    drawdown_series = curve / previous_peaks - 1.0
    trough_index = int(np.argmin(drawdown_series))
    peak_index = 0

    if trough_index > 0:
        peak_index = int(np.argmax(curve[:trough_index + 1]))

    return {
        'value': float(drawdown_series[trough_index]),
        'peak_index': peak_index,
        'trough_index': trough_index,
        'series': drawdown_series.tolist(),
    }


def max_recovery_period(curve: np.ndarray) -> dict:
    longest_recovery = {
        'periods': 0,
        'start_index': None,
        'end_index': None,
        'recovered': True,
    }
    peak_value = curve[0]
    peak_index = 0
    has_drawdown = False

    for period_index in range(1, len(curve)):
        if curve[period_index] >= peak_value:
            recovery_periods = period_index - peak_index

            if has_drawdown and recovery_periods > longest_recovery['periods']:
                longest_recovery = {
                    'periods': recovery_periods,
                    'start_index': peak_index,
                    'end_index': period_index,
                    'recovered': True,
                }

            peak_value = curve[period_index]
            peak_index = period_index
            has_drawdown = False

        else:
            has_drawdown = True

    last_period_index = len(curve) - 1
    recovery_periods = last_period_index - peak_index

    # Незавершённое восстановление учитывается до конца выборки.
    if has_drawdown and recovery_periods > longest_recovery['periods']:
        longest_recovery = {
            'periods': recovery_periods,
            'start_index': peak_index,
            'end_index': last_period_index,
            'recovered': False,
        }

    return longest_recovery


def compute_metrics(
    returns: np.ndarray,
    weights: np.ndarray,
    periods_per_year: int,
    risk_free: float = 0.05,
    start: float = 100.0,
) -> dict:
    period_returns = portfolio_returns(returns, weights)
    curve = equity_curve(period_returns, start)
    observations_count = len(period_returns)
    expected_return = float(period_returns.mean() * periods_per_year)

    cagr = 0.0
    if observations_count:
        cagr = float(
            (curve[-1] / curve[0]) ** (periods_per_year / observations_count) - 1.0
        )

    volatility = 0.0
    if observations_count > 1:
        volatility = float(period_returns.std(ddof=1) * np.sqrt(periods_per_year))

    sharpe_ratio = None
    if volatility > 0:
        sharpe_ratio = (expected_return - risk_free) / volatility

    drawdown = max_drawdown(curve)
    recovery = max_recovery_period(curve)

    return {
        'expected_return': expected_return,
        'cagr': cagr,
        'volatility': volatility,
        'sharpe': sharpe_ratio,
        'max_drawdown': drawdown['value'],
        'max_drawdown_peak': drawdown['peak_index'],
        'max_drawdown_trough': drawdown['trough_index'],
        'max_recovery_periods': recovery['periods'],
        'max_recovery_years': recovery['periods'] / periods_per_year,
        'recovery_start': recovery['start_index'],
        'recovery_end': recovery['end_index'],
        'recovered': recovery['recovered'],
        'curve': curve.tolist(),
        'drawdown': drawdown['series'],
        'period_returns': period_returns.tolist(),
    }
