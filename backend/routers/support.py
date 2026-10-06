import logging
import os
import time

from fastapi import APIRouter, HTTPException, Request

import assistant_service
from schemas.support import SupportRequest


logger = logging.getLogger('portfolio.api')
router = APIRouter(
    prefix='/api',
    tags=['support'],
)

assistant_calls: dict[str, list[float]] = {}


@router.post('/assistant/diagnose', include_in_schema=False)
@router.post('/support/diagnose')
def support_diagnose(data: SupportRequest, request: Request):
    if not os.getenv('OPENROUTER_API_KEY'):
        logger.warning('Support diagnosis requested without OPENROUTER_API_KEY')
        raise HTTPException(
            status_code=503,
            detail='Автоматическая диагностика временно недоступна.',
        )

    client_address = 'unknown'
    if request.client:
        client_address = request.client.host

    current_time = time.monotonic()
    recent_calls = []

    for call_time in assistant_calls.get(client_address, []):
        if current_time - call_time < 3600:
            recent_calls.append(call_time)

    if recent_calls and current_time - recent_calls[-1] < 15:
        raise HTTPException(
            status_code=429,
            detail='Проверка недавней ошибки ещё выполняется. Попробуйте чуть позже.',
        )

    if len(recent_calls) >= 20:
        raise HTTPException(
            status_code=429,
            detail='Слишком много запросов диагностики. Попробуйте позже.',
        )

    recent_calls.append(current_time)
    assistant_calls[client_address] = recent_calls

    try:
        analysis = assistant_service.diagnose(data.stage, data.error, data.context)
    except assistant_service.AssistantError as error:
        logger.warning('Support diagnosis unavailable: %s', error)
        raise HTTPException(
            status_code=502,
            detail='Автоматическая диагностика временно недоступна.',
        ) from error

    return {'analysis': analysis}
