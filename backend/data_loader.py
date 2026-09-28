"""Загрузка данных (Excel/CSV, yfinance, MOEX ISS), корректировка на инфляцию, валидация."""
from __future__ import annotations

import io
import logging
import re
from datetime import date, datetime
from typing import Literal

import numpy as np
import pandas as pd
from pydantic import BaseModel, Field, model_validator

log = logging.getLogger("portfolio.data")

N_ASSETS = 10
MIN_OBS = 30
PERIODS_PER_YEAR = {"daily": 252, "weekly": 52, "monthly": 12, "quarterly": 4, "yearly": 1}
RESAMPLE_RULE = {"weekly": "W-FRI", "monthly": "ME", "quarterly": "QE", "yearly": "YE"}
MONEY_RE = re.compile(r"(m2|денежн|рубл[её]в|money\s*supply)", re.I)
MONEY_DEFAULT_NAME = "M2RU"


class DataError(ValueError):
    """Ошибка данных — сообщение показывается пользователю как есть."""


# ---------------------------------------------------------------------------
# Модели
class Dataset(BaseModel):
    """Номинальные доходности в исходных единицах (как в файле)."""
    columns: list[str]
    index: list[str]                       # даты ISO или номера периодов
    data: list[list[float | None]]         # T × 10
    has_dates: bool = False

    @model_validator(mode="after")
    def validate_shape(self):
        if len(self.columns) != N_ASSETS:
            raise ValueError(f"Нужно ровно {N_ASSETS} индикаторов, получено {len(self.columns)}.")
        if len(self.index) != len(self.data):
            raise ValueError("Количество периодов не совпадает с количеством строк данных.")
        if any(len(row) != N_ASSETS for row in self.data):
            raise ValueError(f"В каждой строке должно быть ровно {N_ASSETS} значений.")
        return self


class InflationSettings(BaseModel):
    source: Literal["constant", "series"] = "constant"
    annual_rate: float = Field(0.08, description="Годовая инфляция в долях, для source=constant")
    series: list[float] | None = Field(None, description="Инфляция за каждый период, в тех же единицах, что и доходности")


class Settings(BaseModel):
    units: Literal["percent", "fraction"] = "percent"
    frequency: Literal["daily", "weekly", "monthly", "quarterly", "yearly"] = "monthly"
    resample_to: Literal["daily", "weekly", "monthly", "quarterly", "yearly"] | None = None
    missing: Literal["ffill", "drop"] = "ffill"
    inflation: InflationSettings = InflationSettings()
    risk_free_nominal: bool = Field(True, description="r_f задана номинальной — пересчитать в реальную")

    @property
    def target_frequency(self) -> str:
        return self.resample_to or self.frequency

    @property
    def periods_per_year(self) -> int:
        return PERIODS_PER_YEAR[self.target_frequency]


# ---------------------------------------------------------------------------
# Парсинг файлов
def _is_num(v) -> bool:
    return isinstance(v, (int, float, np.number)) and not isinstance(v, bool) and np.isfinite(v)


def parse_excel(content: bytes) -> tuple[Dataset, list[str]]:
    """Ищет строку заголовков с 10 подряд текстовыми ячейками, далее читает числовые строки.

    Для файла «бизнес теория.xlsx»: заголовки в строке 2 (B2:K2), данные — строки 3–32,
    строка 33 (AVERAGE) содержит формулы и отсекается как нечисловая.
    """
    from openpyxl import load_workbook

    values = load_workbook(io.BytesIO(content), data_only=True, read_only=True).worksheets[0]
    formulas = load_workbook(io.BytesIO(content), data_only=False, read_only=True).worksheets[0]
    rows = []
    for rv, rf in zip(values.iter_rows(values_only=True), formulas.iter_rows(values_only=True)):
        # ячейки с формулами (итоги вроде AVERAGE) — не наблюдения
        rows.append([None if isinstance(f, str) and f.startswith("=") else v for v, f in zip(rv, rf)])
    return _parse_grid(rows)


def parse_csv(content: bytes) -> tuple[Dataset, list[str]]:
    text = content.decode("utf-8-sig", errors="replace")
    sep = ";" if text.count(";") > text.count(",") else ","
    df = pd.read_csv(io.StringIO(text), sep=sep, header=None, decimal="," if sep == ";" else ".")
    rows = df.where(pd.notna(df), None).values.tolist()
    rows = [[_coerce(v) for v in r] for r in rows]
    return _parse_grid(rows)


def _coerce(v):
    if isinstance(v, str):
        try:
            return float(v.replace(",", ".").replace(" ", ""))
        except ValueError:
            return v
    return v


def _parse_grid(rows: list[list]) -> tuple[Dataset, list[str]]:
    header_row = header_col = None
    for i, r in enumerate(rows):
        for j in range(len(r)):
            block = r[j : j + N_ASSETS]
            if len(block) == N_ASSETS and all(isinstance(v, str) and v.strip() for v in block):
                header_row, header_col = i, j
                break
        if header_row is not None:
            break
    if header_row is None:
        raise DataError("Не найдена строка заголовков с 10 индикаторами подряд (ожидаются столбцы B–K).")

    cols = [str(v).strip() for v in rows[header_row][header_col : header_col + N_ASSETS]]
    index, data, has_dates = [], [], False
    for r in rows[header_row + 1 :]:
        block = (r + [None] * (header_col + N_ASSETS))[header_col : header_col + N_ASSETS]
        numeric = [v if _is_num(v) else None for v in block]
        if all(v is None for v in numeric):
            if data:
                break  # конец блока данных
            continue
        if sum(v is None for v in numeric) > N_ASSETS // 2:
            break
        label = r[header_col - 1] if header_col > 0 else None
        if isinstance(label, (datetime, date)):
            has_dates = True
            index.append(pd.Timestamp(label).date().isoformat())
        elif isinstance(label, str) and _looks_like_date(label):
            has_dates = True
            index.append(pd.Timestamp(label).date().isoformat())
        else:
            index.append(str(int(label)) if _is_num(label) else str(len(data) + 1))
        data.append([float(v) if v is not None else None for v in numeric])

    ds = Dataset(columns=cols, index=index, data=data, has_dates=has_dates)
    return ds, []


def _looks_like_date(s: str) -> bool:
    try:
        pd.Timestamp(s)
        return bool(re.search(r"\d{4}|\d{1,2}[./-]\d{1,2}", s))
    except (ValueError, TypeError):
        return False


def guess_units(ds: Dataset) -> str:
    arr = np.array([v for r in ds.data for v in r if v is not None], dtype=float)
    return "percent" if arr.size and np.nanmax(np.abs(arr)) > 1.0 else "fraction"


def ensure_money_supply(ds: Dataset) -> tuple[Dataset, list[str]]:
    """Индикатор 1 обязан быть рублёвой денежной массой."""
    if MONEY_RE.search(ds.columns[0]):
        return ds, []
    old = ds.columns[0]
    cols = [MONEY_DEFAULT_NAME, *ds.columns[1:]]
    warn = (f"Индикатор 1 («{old}») не подписан как рублёвая денежная масса. Он переименован в "
            f"{MONEY_DEFAULT_NAME} — убедитесь, что в первом столбце действительно ряд M2 РФ.")
    return ds.model_copy(update={"columns": cols}), [warn]


# ---------------------------------------------------------------------------
# Предобработка
def to_frame(ds: Dataset) -> pd.DataFrame:
    df = pd.DataFrame(ds.data, columns=ds.columns, dtype=float)
    df.index = pd.to_datetime(ds.index) if ds.has_dates else pd.Index(ds.index, name="period")
    return df


def preprocess(ds: Dataset, st: Settings) -> tuple[pd.DataFrame, list[str]]:
    """Номинальные доходности → реальные доходности в долях за целевой период."""
    warnings: list[str] = []
    df = to_frame(ds)
    k = 100.0 if st.units == "percent" else 1.0
    df = df / k

    # пропуски
    n_missing = int(df.isna().sum().sum())
    if n_missing:
        df = df.ffill().dropna() if st.missing == "ffill" else df.dropna()
        warnings.append(f"Обработано пропусков: {n_missing} ({'ffill' if st.missing == 'ffill' else 'удаление строк'}).")

    # инфляция за исходный период
    base_ppy = PERIODS_PER_YEAR[st.frequency]
    if st.inflation.source == "series":
        s = st.inflation.series or []
        if len(s) != len(ds.index):
            raise DataError(f"Ряд инфляции: {len(s)} значений, а наблюдений {len(ds.index)}.")
        pi = pd.Series(np.asarray(s, dtype=float) / k, index=to_frame(ds).index).reindex(df.index)
    else:
        pi_p = (1.0 + st.inflation.annual_rate) ** (1.0 / base_ppy) - 1.0
        pi = pd.Series(pi_p, index=df.index)
    df = (1.0 + df).div(1.0 + pi, axis=0) - 1.0  # реальная доходность (1+r)/(1+π) − 1

    # таймфрейм
    if st.resample_to and st.resample_to != st.frequency:
        if PERIODS_PER_YEAR[st.resample_to] > base_ppy:
            raise DataError("Можно агрегировать только к более крупному таймфрейму.")
        if not ds.has_dates:
            raise DataError("Для смены таймфрейма в первом столбце нужны даты.")
        df = (1.0 + df).resample(RESAMPLE_RULE[st.resample_to]).prod() - 1.0

    validate(df)
    return df, warnings


def real_rate(nominal_annual: float, st: Settings) -> float:
    """Перевод номинальной годовой ставки в реальную той же инфляцией, что и доходности."""
    if st.inflation.source == "series" and st.inflation.series:
        k = 100.0 if st.units == "percent" else 1.0
        pi_p = float(np.mean(np.asarray(st.inflation.series, dtype=float) / k))
        pi_a = (1.0 + pi_p) ** PERIODS_PER_YEAR[st.frequency] - 1.0
    else:
        pi_a = st.inflation.annual_rate
    return (1.0 + nominal_annual) / (1.0 + pi_a) - 1.0


def validate(df: pd.DataFrame) -> None:
    if df.shape[1] != N_ASSETS:
        raise DataError(f"Нужно ровно {N_ASSETS} индикаторов, получено {df.shape[1]}.")
    if len(df) < MIN_OBS:
        raise DataError(f"Нужно не менее {MIN_OBS} наблюдений, после обработки осталось {len(df)}.")
    if df.isna().any().any() or not np.isfinite(df.values).all():
        raise DataError("В данных остались NaN или бесконечные значения.")
    if (df.std() == 0).any():
        bad = ", ".join(df.columns[df.std() == 0])
        raise DataError(f"У индикаторов нулевая дисперсия: {bad}.")


# ---------------------------------------------------------------------------
# Загрузка по тикерам
def load_tickers(tickers: list[str], start: str, end: str | None, frequency: str,
                 m2_levels: list[dict] | None) -> tuple[Dataset, list[str]]:
    """Скачивает цены и превращает их в доходности (%) за выбранный период.

    Тикеры с префиксом «MOEX:» берутся из MOEX ISS (например MOEX:IMOEX, MOEX:SBER),
    остальные — из yfinance (GC=F, SPY, TLT …). M2RU в открытых котировочных API нет,
    поэтому её уровни передаются отдельным рядом m2_levels = [{date, value}, …]
    (ЦБ РФ публикует денежную массу на cbr.ru в разделе статистики).
    """
    warnings: list[str] = []
    if frequency not in PERIODS_PER_YEAR:
        raise DataError(f"Неизвестная частота данных: {frequency}.")
    try:
        start_date = pd.Timestamp(start)
        end_date = pd.Timestamp(end) if end else pd.Timestamp.now().normalize()
    except (TypeError, ValueError) as e:
        raise DataError("Укажите корректные даты начала и окончания.") from e
    if start_date >= end_date:
        raise DataError("Дата начала должна быть раньше даты окончания.")

    tickers = [t.strip() for t in tickers if t.strip()]
    if not tickers or not re.fullmatch(MONEY_DEFAULT_NAME, tickers[0], re.I):
        tickers = [MONEY_DEFAULT_NAME, *[t for t in tickers if t.upper() != MONEY_DEFAULT_NAME]]
        warnings.append("Индикатор 1 не был рублёвой массой — подставлен M2RU.")
    if len(tickers) != N_ASSETS:
        raise DataError(f"Нужно 10 индикаторов (M2RU + 9 тикеров), получено {len(tickers)}.")
    if len({ticker.upper() for ticker in tickers}) != N_ASSETS:
        raise DataError("В списке есть повторяющиеся тикеры.")
    if not m2_levels:
        raise DataError("Для M2RU загрузите CSV с уровнями денежной массы (дата; значение) — "
                        "в yfinance и MOEX ISS этого ряда нет.")

    m2 = {}
    for point in m2_levels:
        try:
            stamp = pd.Timestamp(point["date"])
            value = float(point["value"])
        except (KeyError, TypeError, ValueError) as e:
            raise DataError("Ряд M2RU должен содержать корректные пары «дата;значение».") from e
        if pd.isna(stamp) or not np.isfinite(value) or value <= 0:
            raise DataError("Значения M2RU должны быть конечными положительными числами с корректными датами.")
        m2[stamp] = value
    prices = {MONEY_DEFAULT_NAME: pd.Series(m2).sort_index()}
    for t in tickers[1:]:
        prices[t] = _moex_prices(t[5:], start, end) if t.upper().startswith("MOEX:") else _yf_prices(t, start, end)

    px = pd.DataFrame(prices).sort_index()
    rule = RESAMPLE_RULE.get(frequency)
    px = px.resample(rule).last() if rule else px
    px = px.ffill().dropna()
    rets = px.pct_change().dropna() * 100.0
    ds = Dataset(columns=list(rets.columns), index=[d.date().isoformat() for d in rets.index],
                 data=rets.values.tolist(), has_dates=True)
    if len(ds.data) < MIN_OBS:
        warnings.append(f"Получено {len(ds.data)} наблюдений — для анализа нужно не менее {MIN_OBS}.")
    return ds, warnings


def _yf_prices(ticker: str, start: str, end: str | None) -> pd.Series:
    import yfinance as yf

    try:
        df = yf.download(ticker, start=start, end=end, auto_adjust=True, progress=False)
    except Exception as e:
        log.warning("Yahoo Finance request failed for %s: %s", ticker, e)
        raise DataError(f"Не удалось загрузить котировки {ticker} из Yahoo Finance.") from e
    if df is None or df.empty or "Close" not in df:
        raise DataError(f"Yahoo Finance не вернул цены закрытия по {ticker}.")
    s = df["Close"]
    s = s.iloc[:, 0] if isinstance(s, pd.DataFrame) else s
    s = pd.to_numeric(s, errors="coerce").dropna()
    s = s[s > 0]
    if s.empty or not np.isfinite(s.to_numpy(dtype=float)).all():
        raise DataError(f"В данных Yahoo Finance по {ticker} нет корректных цен.")
    return s.rename(ticker)


def _moex_prices(secid: str, start: str, end: str | None) -> pd.Series:
    import requests

    engine_market = "stock/index" if secid.upper() in {"IMOEX", "RTSI", "MOEXBC", "RGBI", "RGBITR"} else "stock/shares"
    board = "" if "index" in engine_market else "/boards/TQBR"
    url = f"https://iss.moex.com/iss/history/engines/{engine_market.split('/')[0]}/markets/{engine_market.split('/')[1]}{board}/securities/{secid}.json"
    out, cursor = {}, 0
    while True:
        params = {"from": start, "start": cursor, "iss.meta": "off", "history.columns": "TRADEDATE,CLOSE"}
        if end:
            params["till"] = end
        try:
            response = requests.get(url, params=params, timeout=20)
            response.raise_for_status()
            payload = response.json()
            history = payload.get("history", {})
            rows = history.get("data", [])
        except (requests.RequestException, ValueError, AttributeError) as e:
            log.warning("MOEX ISS request failed for %s: %s", secid, e)
            raise DataError(f"Не удалось загрузить котировки {secid} с MOEX.") from e
        if not rows:
            break
        for row in rows:
            if not isinstance(row, (list, tuple)) or len(row) < 2 or row[1] is None:
                continue
            try:
                price = float(row[1])
                if np.isfinite(price) and price > 0:
                    out[pd.Timestamp(row[0])] = price
            except (TypeError, ValueError):
                continue
        cursor += len(rows)
    if not out:
        raise DataError(f"MOEX ISS не вернул данных по {secid}.")
    return pd.Series(out).sort_index().rename(f"MOEX:{secid}")
