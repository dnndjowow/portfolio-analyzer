from typing import Literal
from pydantic import BaseModel, Field, model_validator

from config import MIN_ASSETS, MAX_ASSETS, PERIODS_PER_YEAR, EXCLUDED_INDICATOR_RE


class Dataset(BaseModel):
    columns: list[str]
    index: list[str]
    data: list[list[float | None]]
    has_dates: bool = False

    @model_validator(mode='after')
    def validate_shape(self):
        n_assets = len(self.columns)
        if not MIN_ASSETS <= n_assets <= MAX_ASSETS:
            raise ValueError(
                f'Нужно от {MIN_ASSETS} до {MAX_ASSETS} активов, получено {n_assets}.'
            )

        if any(not name.strip() for name in self.columns):
            raise ValueError('Названия активов не должны быть пустыми.')
        if len({name.strip().upper() for name in self.columns}) != n_assets:
            raise ValueError('Названия активов должны быть уникальными.')
        if any(EXCLUDED_INDICATOR_RE.search(name.strip()) for name in self.columns):
            raise ValueError('Показатель M2 исключён. Удалите его столбец из данных.')

        if len(self.index) != len(self.data):
            raise ValueError('Количество периодов не совпадает с количеством строк данных.')

        for observation in self.data:
            if len(observation) != n_assets:
                raise ValueError(f'В каждой строке должно быть ровно {n_assets} значений.')

        return self


class InflationSettings(BaseModel):
    source: Literal['constant', 'series'] = 'constant'
    annual_rate: float = Field(
        0.08,
        description='Годовая инфляция в долях, для source=constant',
    )
    series: list[float] | None = Field(
        None,
        description='Инфляция за каждый период, в тех же единицах, что и доходности',
    )


class Settings(BaseModel):
    units: Literal['percent', 'fraction'] = 'percent'
    frequency: Literal['daily', 'weekly', 'monthly', 'quarterly', 'yearly'] = 'monthly'
    resample_to: Literal['daily', 'weekly', 'monthly', 'quarterly', 'yearly'] | None = None
    missing: Literal['ffill', 'drop'] = 'ffill'
    inflation: InflationSettings = Field(default_factory=InflationSettings)
    risk_free_nominal: bool = Field(
        True,
        description='r_f задана номинальной — пересчитать в реальную',
    )

    @property
    def target_frequency(self) -> str:
        if self.resample_to:
            return self.resample_to

        return self.frequency

    @property
    def periods_per_year(self) -> int:
        return PERIODS_PER_YEAR[self.target_frequency]


class TickersRequest(BaseModel):
    tickers: list[str] = Field(..., min_length=MIN_ASSETS, max_length=MAX_ASSETS)
    start: str = '2015-01-01'
    end: str | None = None
    frequency: Literal['daily', 'weekly', 'monthly', 'quarterly', 'yearly'] = 'monthly'
