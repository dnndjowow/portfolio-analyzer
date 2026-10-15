import logging

from fastapi import APIRouter, File, HTTPException, UploadFile

import data_loader
from schemas.data import TickersRequest


logger = logging.getLogger('portfolio.api')
router = APIRouter(
    prefix='/api',
    tags=['data'],
)


@router.post('/upload')
async def upload(file: UploadFile = File(...)):
    file_content = await file.read()
    file_name = (file.filename or '').lower()

    try:
        if file_name.endswith('.csv'):
            dataset, warnings = data_loader.parse_csv(file_content)
        else:
            dataset, warnings = data_loader.parse_excel(file_content)

        if len(dataset.data) < data_loader.MIN_OBS:
            warnings.append(
                f'В файле {len(dataset.data)} наблюдений — '
                f'нужно не меньше {data_loader.MIN_OBS}.'
            )

    except data_loader.DataError as error:
        raise HTTPException(
            status_code=422,
            detail=str(error),
        ) from error

    except Exception as error:
        logger.exception('upload failed')
        raise HTTPException(
            status_code=422,
            detail=f'Не удалось прочитать файл: {error}',
        ) from error

    logger.info(
        'upload %s: %d rows × %d cols',
        file.filename,
        len(dataset.data),
        len(dataset.columns),
    )

    return {
        'dataset': dataset,
        'preview': {
            'index': dataset.index[:20],
            'data': dataset.data[:20],
        },
        'n_obs': len(dataset.data),
        'suggested_units': data_loader.guess_units(dataset),
        'warnings': warnings,
    }


@router.post('/load-tickers')
def load_tickers(data: TickersRequest):
    try:
        dataset, warnings = data_loader.load_tickers(
            data.tickers,
            data.start,
            data.end,
            data.frequency,
        )
    except data_loader.DataError as error:
        raise HTTPException(
            status_code=422,
            detail=str(error),
        ) from error

    return {
        'dataset': dataset,
        'preview': {
            'index': dataset.index[:20],
            'data': dataset.data[:20],
        },
        'n_obs': len(dataset.data),
        'suggested_units': 'percent',
        'frequency': data.frequency,
        'warnings': warnings,
    }
