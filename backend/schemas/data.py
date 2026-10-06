from typing import Literal
from pydantic import BaseModel, Field, model_validator

from config import N_ASSETS, PERIODS_PER_YEAR


class Dataset(BaseModel):
    columns: list[str]
    index: list[str]
    data: list[list[float | None]]
    has_dates: bool = False

    @model_validator(mode='after')
    def validate_shape(self):
        if len(self.columns) != N_ASSETS:
            raise ValueError(
                f'Нужно ровно {N_ASSETS} индикаторов, получено {len(self.columns)}.'
            )

        if len(self.index) != len(self.data):
            raise ValueError('Количество периодов не совпадает с количеством строк данных.')

        for observation in self.data:
            if len(observation) != N_ASSETS:
                raise ValueError(f'В каждой строке должно быть ровно {N_ASSETS} значений.')

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
    tickers: list[str]
    start: str = '2015-01-01'
    end: str | None = None
    frequency: str = 'monthly'
    m2_levels: list[dict] | None = None
