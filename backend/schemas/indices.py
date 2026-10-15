from datetime import date
from typing import Literal

from pydantic import BaseModel, Field, model_validator
from index_catalog import INDEX_BY_ID


class IndexPortfolioRequest(BaseModel):
    indices: list[str] = Field(..., min_length=2, max_length=10)
    weights: list[float] | None = None
    capital: float = Field(100000, gt=0, le=1e12, allow_inf_nan=False)
    start: date = date(2015, 1, 1)
    end: date | None = None
    frequency: Literal['monthly', 'quarterly', 'yearly'] = 'monthly'
    rebalance: Literal['none', 'monthly', 'quarterly', 'yearly'] = 'monthly'
    base_currency: Literal['RUB'] = 'RUB'
    mode: Literal['manual', 'min_vol', 'max_sharpe'] = 'manual'
    risk_free: float = Field(0.05, ge=-0.99, le=1, allow_inf_nan=False)
    include_m2: bool = True
    allow_short: Literal[False] = False

    @model_validator(mode='after')
    def check_request(self):
        if len(set(self.indices)) != len(self.indices):
            raise ValueError('Индексы не должны повторяться.')
        if any(index not in INDEX_BY_ID for index in self.indices):
            raise ValueError('Выберите индексы из каталога. M2 используется только для сравнения.')
        if self.start.day != 1:
            raise ValueError('Начало периода должно быть первым днём месяца.')
        if self.end is not None and self.end < self.start:
            raise ValueError('Окончание периода должно быть не раньше начала.')
        if self.weights is not None:
            import math
            if len(self.weights) != len(self.indices):
                raise ValueError('Число весов должно совпадать с числом индексов.')
            if any(not math.isfinite(w) or w < 0 or w > 1 for w in self.weights):
                raise ValueError('Веса должны быть от 0 до 1. Короткие продажи запрещены.')
            if abs(sum(self.weights) - 1) > 1e-6:
                raise ValueError('Сумма весов должна быть 100%.')
        return self
