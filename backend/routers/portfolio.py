import numpy as np
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

import metrics
import optimizer
from schemas.portfolio import (
    OptimizeRequest,
    FrontierRequest,
    MetricsRequest,
    CompareRequest,
    ExportRequest,
)
from services.portfolio import prepare_portfolio, check_weights, get_curve_index
from services.export import create_portfolio_export


router = APIRouter(
    prefix='/api',
    tags=['portfolio'],
)


@router.post('/optimize')
def optimize(data: OptimizeRequest):
    returns_frame, portfolio_inputs, periods_per_year, warnings = prepare_portfolio(data)

    try:
        portfolio_weights = optimizer.optimize(
            portfolio_inputs,
            data.mode,
            data.risk_free,
            data.target_return,
            data.target_vol,
        )
    except optimizer.OptimizationError as error:
        raise HTTPException(
            status_code=422,
            detail=str(error),
        ) from error

    if data.mode == optimizer.Mode.MAX_SHARPE:
        warning_message = optimizer.sharpe_warning(portfolio_inputs, data.risk_free)
        if warning_message:
            warnings.append(warning_message)

    portfolio_metrics = metrics.compute_metrics(
        returns_frame.values,
        portfolio_weights,
        periods_per_year,
        data.risk_free,
    )

    return {
        'mode': data.mode,
        'risk_free_real': data.risk_free,
        'assets': list(returns_frame.columns),
        'weights': portfolio_weights.tolist(),
        'point': {
            'ret': optimizer.port_return(portfolio_weights, portfolio_inputs),
            'vol': optimizer.port_vol(portfolio_weights, portfolio_inputs),
        },
        'metrics': portfolio_metrics,
        'index': get_curve_index(returns_frame),
        'warnings': warnings,
    }


@router.post('/efficient-frontier')
def frontier(data: FrontierRequest):
    returns_frame, portfolio_inputs, periods_per_year, warnings = prepare_portfolio(data)

    try:
        minimum_volatility_weights = optimizer.min_volatility(portfolio_inputs)
        minimum_volatility = {
            'ret': optimizer.port_return(minimum_volatility_weights, portfolio_inputs),
            'vol': optimizer.port_vol(minimum_volatility_weights, portfolio_inputs),
            'weights': minimum_volatility_weights.tolist(),
        }

        maximum_sharpe_weights = optimizer.max_sharpe(portfolio_inputs, data.risk_free)
        maximum_sharpe = {
            'ret': optimizer.port_return(maximum_sharpe_weights, portfolio_inputs),
            'vol': optimizer.port_vol(maximum_sharpe_weights, portfolio_inputs),
            'weights': maximum_sharpe_weights.tolist(),
            'sharpe': optimizer.sharpe(maximum_sharpe_weights, portfolio_inputs, data.risk_free),
        }

        warning_message = optimizer.sharpe_warning(portfolio_inputs, data.risk_free)
        if warning_message:
            warnings.append(warning_message)

        frontier_points = optimizer.efficient_frontier(portfolio_inputs, data.n_points)

    except optimizer.OptimizationError as error:
        raise HTTPException(
            status_code=422,
            detail=str(error),
        ) from error

    assets = []
    for asset_index, asset_name in enumerate(returns_frame.columns):
        asset_return = float(portfolio_inputs.mu[asset_index])
        asset_volatility = float(np.sqrt(portfolio_inputs.cov[asset_index, asset_index]))
        assets.append({
            'name': asset_name,
            'ret': asset_return,
            'vol': asset_volatility,
        })

    random_portfolios = optimizer.monte_carlo(
        portfolio_inputs,
        data.risk_free,
        data.n_samples,
    )

    return {
        'frontier': frontier_points,
        'cloud': random_portfolios,
        'assets': assets,
        'min_vol': minimum_volatility,
        'max_sharpe': maximum_sharpe,
        'risk_free_real': data.risk_free,
        'warnings': warnings,
    }


@router.post('/portfolio/metrics')
def portfolio_metrics(data: MetricsRequest):
    returns_frame, portfolio_inputs, periods_per_year, warnings = prepare_portfolio(data)
    portfolio_weights = check_weights(data.weights, data.allow_short)

    calculated_metrics = metrics.compute_metrics(
        returns_frame.values,
        portfolio_weights,
        periods_per_year,
        data.risk_free,
    )

    return {
        'metrics': calculated_metrics,
        'point': {
            'ret': optimizer.port_return(portfolio_weights, portfolio_inputs),
            'vol': optimizer.port_vol(portfolio_weights, portfolio_inputs),
        },
        'index': get_curve_index(returns_frame),
        'warnings': warnings,
    }


@router.post('/compare')
def compare(data: CompareRequest):
    returns_frame, portfolio_inputs, periods_per_year, warnings = prepare_portfolio(data)
    portfolio_series = []

    for portfolio in data.portfolios:
        portfolio_weights = check_weights(portfolio.weights, data.allow_short)
        calculated_metrics = metrics.compute_metrics(
            returns_frame.values,
            portfolio_weights,
            periods_per_year,
            data.risk_free,
        )

        curve = calculated_metrics.pop('curve')
        drawdown = calculated_metrics.pop('drawdown')
        summary_metrics = {}

        for metric_name, metric_value in calculated_metrics.items():
            if metric_name != 'period_returns':
                summary_metrics[metric_name] = metric_value

        portfolio_series.append({
            'name': portfolio.name,
            'curve': curve,
            'drawdown': drawdown,
            'point': {
                'ret': optimizer.port_return(portfolio_weights, portfolio_inputs),
                'vol': optimizer.port_vol(portfolio_weights, portfolio_inputs),
            },
            'metrics': summary_metrics,
        })

    return {
        'index': get_curve_index(returns_frame),
        'series': portfolio_series,
        'warnings': warnings,
    }


@router.post('/export')
def export(data: ExportRequest):
    export_file = create_portfolio_export(data)

    return StreamingResponse(
        export_file,
        media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        headers={
            'Content-Disposition': 'attachment; filename="portfolio_export.xlsx"',
        },
    )
