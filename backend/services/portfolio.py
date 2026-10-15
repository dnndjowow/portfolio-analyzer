import numpy as np
from fastapi import HTTPException

import data_loader
import optimizer
from schemas.portfolio import PortfolioRequest


def prepare_portfolio(data: PortfolioRequest):
    if not np.isfinite(data.risk_free):
        raise HTTPException(
            status_code=422,
            detail='Безрисковая ставка должна быть конечным числом.',
        )

    try:
        returns_frame, warnings = data_loader.preprocess(data.returns, data.settings)
    except data_loader.DataError as error:
        raise HTTPException(
            status_code=422,
            detail=str(error),
        ) from error

    periods_per_year = data.settings.periods_per_year
    portfolio_inputs = optimizer.make_inputs(
        returns_frame.values,
        periods_per_year,
    )

    if data.settings.risk_free_nominal:
        data.risk_free = data_loader.real_rate(data.risk_free, data.settings)

    return returns_frame, portfolio_inputs, periods_per_year, warnings


def check_weights(weights: list[float], n_assets: int) -> np.ndarray:
    portfolio_weights = np.asarray(weights, dtype=float)

    if portfolio_weights.shape != (n_assets,):
        raise HTTPException(
            status_code=422,
            detail=f'Нужно {n_assets} весов, получено {portfolio_weights.size}.',
        )

    if not np.isfinite(portfolio_weights).all():
        raise HTTPException(
            status_code=422,
            detail='Веса должны быть конечными числами.',
        )

    total_weight = float(portfolio_weights.sum())

    if abs(total_weight - 1) > 1e-6:
        raise HTTPException(
            status_code=422,
            detail=f'Сумма весов должна быть 1, получено {total_weight:.4f}.',
        )

    if np.any(portfolio_weights < 0) or np.any(portfolio_weights > 1):
        raise HTTPException(
            status_code=422,
            detail='Короткие продажи запрещены: вес каждого актива должен быть от 0 до 1.',
        )

    return portfolio_weights


def get_curve_index(returns_frame) -> list[str]:
    periods = ['старт']

    for period in returns_frame.index:
        if hasattr(period, 'date'):
            label = str(period.date())
        else:
            label = str(period)

        periods.append(label)

    return periods
