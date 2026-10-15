from fastapi import APIRouter, HTTPException

from data_loader import DataError
from index_catalog import INDEX_CATALOG, INDEX_BY_ID
from index_analysis import analyze_history
from market_indices import load_history
from optimizer import OptimizationError
from schemas.indices import IndexPortfolioRequest

router = APIRouter(prefix='/api', tags=['indices'])


@router.get('/index-catalog')
def catalog():
    return {'indices': INDEX_CATALOG, 'base_currency': 'RUB', 'min_selection': 2, 'max_selection': 10}


@router.post('/index-portfolio')
def index_portfolio(data: IndexPortfolioRequest):
    try:
        history = load_history(data.indices, data.start, data.end, data.include_m2)
        result = analyze_history(history, data)
        result['indices'] = [INDEX_BY_ID[key] for key in data.indices]
        return result
    except (DataError, OptimizationError) as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
