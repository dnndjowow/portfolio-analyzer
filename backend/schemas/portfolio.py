from typing import Literal

from pydantic import BaseModel, Field

from schemas.data import Dataset, Settings
from optimizer import Mode


class PortfolioRequest(BaseModel):
    returns: Dataset
    settings: Settings = Field(default_factory=Settings)
    risk_free: float = Field(
        0.05,
        description='Годовая безрисковая ставка в долях',
    )
    # Старые клиенты с false совместимы; true всегда отклоняется с HTTP 422.
    allow_short: Literal[False] = False


class OptimizeRequest(PortfolioRequest):
    mode: Mode
    target_return: float | None = Field(None, allow_inf_nan=False)
    target_vol: float | None = Field(None, ge=0, allow_inf_nan=False)


class FrontierRequest(PortfolioRequest):
    n_points: int = Field(40, ge=5, le=200)
    n_samples: int = Field(5000, ge=100, le=20000)


class MetricsRequest(PortfolioRequest):
    weights: list[float]


class NamedWeights(BaseModel):
    name: str
    weights: list[float]


class CompareRequest(PortfolioRequest):
    portfolios: list[NamedWeights] = Field(..., min_length=1, max_length=5)


class ExportRequest(PortfolioRequest):
    portfolios: list[NamedWeights] = Field(..., min_length=1)
