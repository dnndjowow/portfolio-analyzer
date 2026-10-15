import numpy as np
import pandas as pd

from data_loader import DataError
from config import MIN_OBS
from metrics import equity_curve, max_drawdown
from optimizer import make_inputs, optimize, Mode


def simulate_portfolio(returns, weights, rebalance):
    """Monthly buy-and-hold holdings; rebalance at calendar period starts."""
    values = np.asarray(weights, dtype=float).copy()
    path = [float(values.sum())]
    period_returns, start_weights = [], []
    for i, (date, row) in enumerate(returns.iterrows()):
        reset = rebalance == 'monthly' or (rebalance == 'quarterly' and date.month in (1, 4, 7, 10)) or (rebalance == 'yearly' and date.month == 1)
        if i and reset:
            values = values.sum() * weights
        start_weights.append((values / values.sum()).tolist())
        previous = float(values.sum())
        values *= 1 + row.to_numpy(dtype=float)
        total = float(values.sum())
        period_returns.append(total / previous - 1)
        path.append(total)
    return np.asarray(period_returns), np.asarray(path), start_weights, values / values.sum()


def summarize(period_returns, curve):
    n = len(period_returns)
    annual_return = float(np.mean(period_returns) * 12)
    volatility = float(np.std(period_returns, ddof=1) * np.sqrt(12))
    return {'total_return': float(curve[-1] / curve[0] - 1),
            'cagr': float((curve[-1] / curve[0]) ** (12 / n) - 1),
            'expected_return': annual_return, 'volatility': volatility,
            'max_drawdown': max_drawdown(curve)['value']}


def analyze_history(history, request):
    returns = history['returns']
    inflation = history['inflation'].to_numpy(dtype=float)
    real_assets = (1 + returns).div(1 + history['inflation'], axis=0) - 1
    if not np.isfinite(returns.values).all() or np.any(returns.values <= -1):
        raise DataError('Некорректная история доходностей индексов.')
    if not np.isfinite(inflation).all() or np.any(inflation <= -1):
        raise DataError('Некорректный ряд инфляции.')
    annual_inflation = float(np.prod(1 + inflation) ** (12 / len(inflation)) - 1)
    risk_free_real = (1 + request.risk_free) / (1 + annual_inflation) - 1
    inputs = make_inputs(real_assets.values, 12)
    weights = np.array(request.weights if request.weights is not None else [1 / len(request.indices)] * len(request.indices))
    weights = weights / weights.sum()
    if request.mode != 'manual':
        if len(returns) < MIN_OBS:
            raise DataError(f'Для подбора оптимальных весов нужно минимум {MIN_OBS} месяцев истории. Задайте веса вручную или увеличьте период.')
        weights = optimize(inputs, Mode(request.mode), risk_free_real)
    nominal_returns, growth, start_weights, final_weights = simulate_portfolio(returns, weights, request.rebalance)
    real_returns = (1 + nominal_returns) / (1 + inflation) - 1
    real_growth = equity_curve(real_returns, 1)
    nominal_curve = request.capital * growth
    real_curve = request.capital * real_growth
    nominal_metrics = summarize(nominal_returns, nominal_curve)
    real_metrics = summarize(real_returns, real_curve)
    real_metrics['sharpe'] = ((real_metrics['expected_return'] - risk_free_real) / real_metrics['volatility']) if real_metrics['volatility'] > 0 else None
    dates = pd.DatetimeIndex([history['baseline'], *returns.index])
    rule = {'monthly': 'M', 'quarterly': 'Q', 'yearly': 'Y'}[request.frequency]
    # Группируются только график и таблица. Симуляция и риск всегда месячные.
    groups = returns.index.to_period(rule)
    end_indices = [i + 1 for i in range(len(groups)) if i == len(groups) - 1 or groups[i] != groups[i + 1]]
    chosen = [0, *end_indices]
    drawdown_nominal = max_drawdown(nominal_curve)['series']
    drawdown_real = max_drawdown(real_curve)['series']
    benchmark = None
    if history['m2'] is not None:
        values = history['m2'].reindex(dates).to_numpy(dtype=float)
        benchmark = values / values[0] * 100
    rows = []
    previous = 0
    for position in chosen:
        m2_value = float(benchmark[position]) if benchmark is not None and np.isfinite(benchmark[position]) else None
        rows.append({'date': dates[position].date().isoformat(),
                     'nominal': float(nominal_curve[position]), 'real': float(real_curve[position]),
                     'nominal_growth': float(growth[position] * 100), 'real_growth': float(real_growth[position] * 100),
                     'm2_growth': m2_value,
                     'nominal_return': float(growth[position] / growth[previous] - 1) if position else None,
                     'real_return': float(real_growth[position] / real_growth[previous] - 1) if position else None,
                     'inflation': float(np.prod(1 + inflation[previous:position]) - 1) if position else None,
                     'nominal_drawdown': drawdown_nominal[position], 'real_drawdown': drawdown_real[position]})
        previous = position
    return {'weights': weights.tolist(), 'final_weights': final_weights.tolist(), 'capital': request.capital,
            'base_currency': 'RUB', 'mode': request.mode, 'rebalance': request.rebalance, 'frequency': request.frequency,
            'start': dates[0].date().isoformat(), 'end': dates[-1].date().isoformat(), 'n_months': len(returns),
            'nominal_metrics': nominal_metrics, 'real_metrics': real_metrics,
            'final_nominal_capital': float(nominal_curve[-1]), 'final_real_capital': float(real_curve[-1]),
            'cumulative_inflation': float(np.prod(1 + inflation) - 1),
            'risk_free_real': risk_free_real, 'rows': rows,
            'monthly_weights': start_weights,
            'warnings': history['warnings'],
            'sources': {'indices': ['MOEX ISS', 'Yahoo Finance'], 'inflation': history['cpi_source'],
                        'currency': 'https://www.cbr.ru/development/SXML/',
                        'm2': 'https://www.cbr.ru/statistics/macro_itm/dkfs/monetary_agg/'}}
