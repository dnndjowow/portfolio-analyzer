import io
import logging
import re
from datetime import date, datetime

import numpy as np
import pandas as pd

from schemas.data import Dataset, InflationSettings, Settings
from config import (
    N_ASSETS,
    MIN_OBS,
    PERIODS_PER_YEAR,
    RESAMPLE_RULE,
    MONEY_RE,
    MONEY_DEFAULT_NAME,
)


logger = logging.getLogger('portfolio.data')


class DataError(ValueError):
    pass


def _is_number(value) -> bool:
    if not isinstance(value, (int, float, np.number)) or isinstance(value, bool):
        return False

    return np.isfinite(value)


def parse_excel(content: bytes) -> tuple[Dataset, list[str]]:
    from openpyxl import load_workbook

    values_sheet = load_workbook(
        io.BytesIO(content),
        data_only=True,
        read_only=True,
    ).worksheets[0]
    formulas_sheet = load_workbook(
        io.BytesIO(content),
        data_only=False,
        read_only=True,
    ).worksheets[0]
    rows = []

    for values_row, formulas_row in zip(
        values_sheet.iter_rows(values_only=True),
        formulas_sheet.iter_rows(values_only=True),
    ):
        row = []

        for value, formula in zip(values_row, formulas_row):
            # Итоговые строки с формулами не являются наблюдениями.
            if isinstance(formula, str) and formula.startswith('='):
                row.append(None)
            else:
                row.append(value)

        rows.append(row)

    return _parse_grid(rows)


def parse_csv(content: bytes) -> tuple[Dataset, list[str]]:
    text = content.decode('utf-8-sig', errors='replace')
    separator = ','
    decimal_separator = '.'

    if text.count(';') > text.count(','):
        separator = ';'
        decimal_separator = ','

    data_frame = pd.read_csv(
        io.StringIO(text),
        sep=separator,
        header=None,
        decimal=decimal_separator,
    )
    raw_rows = data_frame.where(pd.notna(data_frame), None).values.tolist()
    rows = []

    for row in raw_rows:
        rows.append([_parse_value(value) for value in row])

    return _parse_grid(rows)


def _parse_value(value):
    if isinstance(value, str):
        try:
            return float(value.replace(',', '.').replace(' ', ''))
        except ValueError:
            return value

    return value


def _parse_grid(rows: list[list]) -> tuple[Dataset, list[str]]:
    header_row = None
    header_column = None

    for row_index, row in enumerate(rows):
        for column_index in range(len(row)):
            header_values = row[column_index:column_index + N_ASSETS]
            has_asset_count = len(header_values) == N_ASSETS
            has_text_headers = all(
                isinstance(value, str) and value.strip()
                for value in header_values
            )

            if has_asset_count and has_text_headers:
                header_row = row_index
                header_column = column_index
                break

        if header_row is not None:
            break

    if header_row is None:
        raise DataError(
            'Не найдена строка заголовков с 10 индикаторами подряд '
            '(ожидаются столбцы B–K).'
        )

    columns = [
        str(value).strip()
        for value in rows[header_row][header_column:header_column + N_ASSETS]
    ]
    periods = []
    observations = []
    has_dates = False

    for row in rows[header_row + 1:]:
        padded_row = row + [None] * (header_column + N_ASSETS)
        row_values = padded_row[header_column:header_column + N_ASSETS]
        numeric_values = []

        for value in row_values:
            if _is_number(value):
                numeric_values.append(value)
            else:
                numeric_values.append(None)

        if all(value is None for value in numeric_values):
            if observations:
                break
            continue

        if sum(value is None for value in numeric_values) > N_ASSETS // 2:
            break

        period_label = None
        if header_column > 0:
            period_label = row[header_column - 1]

        if isinstance(period_label, (datetime, date)):
            has_dates = True
            periods.append(pd.Timestamp(period_label).date().isoformat())
        elif isinstance(period_label, str) and _looks_like_date(period_label):
            has_dates = True
            periods.append(pd.Timestamp(period_label).date().isoformat())
        elif _is_number(period_label):
            periods.append(str(int(period_label)))
        else:
            periods.append(str(len(observations) + 1))

        observation = []
        for value in numeric_values:
            if value is None:
                observation.append(None)
            else:
                observation.append(float(value))

        observations.append(observation)

    dataset = Dataset(
        columns=columns,
        index=periods,
        data=observations,
        has_dates=has_dates,
    )

    return dataset, []


def _looks_like_date(value: str) -> bool:
    try:
        pd.Timestamp(value)
        return bool(re.search(r'\d{4}|\d{1,2}[./-]\d{1,2}', value))
    except (ValueError, TypeError):
        return False


def guess_units(dataset: Dataset) -> str:
    numeric_values = [
        value
        for row in dataset.data
        for value in row
        if value is not None
    ]
    returns_array = np.array(numeric_values, dtype=float)

    if returns_array.size and np.nanmax(np.abs(returns_array)) > 1.0:
        return 'percent'

    return 'fraction'


def ensure_money_supply(dataset: Dataset) -> tuple[Dataset, list[str]]:
    if MONEY_RE.search(dataset.columns[0]):
        return dataset, []

    original_name = dataset.columns[0]
    columns = [MONEY_DEFAULT_NAME, *dataset.columns[1:]]
    warning_message = (
        f'Индикатор 1 («{original_name}») не подписан как рублёвая денежная масса. '
        f'Он переименован в {MONEY_DEFAULT_NAME} — убедитесь, '
        'что в первом столбце действительно ряд M2 РФ.'
    )
    updated_dataset = dataset.model_copy(update={'columns': columns})

    return updated_dataset, [warning_message]


def to_frame(dataset: Dataset) -> pd.DataFrame:
    returns_frame = pd.DataFrame(dataset.data, columns=dataset.columns, dtype=float)

    if dataset.has_dates:
        returns_frame.index = pd.to_datetime(dataset.index)
    else:
        returns_frame.index = pd.Index(dataset.index, name='period')

    return returns_frame


def preprocess(dataset: Dataset, settings: Settings) -> tuple[pd.DataFrame, list[str]]:
    warnings = []
    returns_frame = to_frame(dataset)
    unit_divisor = 1.0

    if settings.units == 'percent':
        unit_divisor = 100.0

    returns_frame = returns_frame / unit_divisor
    missing_count = int(returns_frame.isna().sum().sum())

    if missing_count:
        if settings.missing == 'ffill':
            returns_frame = returns_frame.ffill().dropna()
            missing_method = 'ffill'
        else:
            returns_frame = returns_frame.dropna()
            missing_method = 'удаление строк'

        warnings.append(f'Обработано пропусков: {missing_count} ({missing_method}).')

    source_periods_per_year = PERIODS_PER_YEAR[settings.frequency]

    if settings.inflation.source == 'series':
        inflation_values = settings.inflation.series or []
        if len(inflation_values) != len(dataset.index):
            raise DataError(
                f'Ряд инфляции: {len(inflation_values)} значений, '
                f'а наблюдений {len(dataset.index)}.'
            )

        inflation_series = pd.Series(
            np.asarray(inflation_values, dtype=float) / unit_divisor,
            index=to_frame(dataset).index,
        ).reindex(returns_frame.index)

    else:
        period_inflation = (
            (1.0 + settings.inflation.annual_rate) ** (1.0 / source_periods_per_year) - 1.0
        )
        inflation_series = pd.Series(period_inflation, index=returns_frame.index)

    # Реальная доходность: (1 + номинальная) / (1 + инфляция) − 1.
    returns_frame = (1.0 + returns_frame).div(1.0 + inflation_series, axis=0) - 1.0

    if settings.resample_to and settings.resample_to != settings.frequency:
        if PERIODS_PER_YEAR[settings.resample_to] > source_periods_per_year:
            raise DataError('Можно агрегировать только к более крупному таймфрейму.')

        if not dataset.has_dates:
            raise DataError('Для смены таймфрейма в первом столбце нужны даты.')

        returns_frame = (
            (1.0 + returns_frame).resample(RESAMPLE_RULE[settings.resample_to]).prod() - 1.0
        )

    validate(returns_frame)

    return returns_frame, warnings


def real_rate(nominal_annual: float, settings: Settings) -> float:
    if settings.inflation.source == 'series' and settings.inflation.series:
        unit_divisor = 1.0
        if settings.units == 'percent':
            unit_divisor = 100.0

        period_inflation = float(np.mean(
            np.asarray(settings.inflation.series, dtype=float) / unit_divisor
        ))
        annual_inflation = (1.0 + period_inflation) ** PERIODS_PER_YEAR[settings.frequency] - 1.0
    else:
        annual_inflation = settings.inflation.annual_rate

    return (1.0 + nominal_annual) / (1.0 + annual_inflation) - 1.0


def validate(returns_frame: pd.DataFrame) -> None:
    if returns_frame.shape[1] != N_ASSETS:
        raise DataError(
            f'Нужно ровно {N_ASSETS} индикаторов, получено {returns_frame.shape[1]}.'
        )

    if len(returns_frame) < MIN_OBS:
        raise DataError(
            f'Нужно не менее {MIN_OBS} наблюдений, '
            f'после обработки осталось {len(returns_frame)}.'
        )

    if returns_frame.isna().any().any() or not np.isfinite(returns_frame.values).all():
        raise DataError('В данных остались NaN или бесконечные значения.')

    zero_variance = returns_frame.std() == 0
    if zero_variance.any():
        invalid_assets = ', '.join(returns_frame.columns[zero_variance])
        raise DataError(f'У индикаторов нулевая дисперсия: {invalid_assets}.')


def load_tickers(
    tickers: list[str],
    start: str,
    end: str | None,
    frequency: str,
    m2_levels: list[dict] | None,
) -> tuple[Dataset, list[str]]:
    warnings = []

    if frequency not in PERIODS_PER_YEAR:
        raise DataError(f'Неизвестная частота данных: {frequency}.')

    try:
        start_date = pd.Timestamp(start)
        if end:
            end_date = pd.Timestamp(end)
        else:
            end_date = pd.Timestamp.now().normalize()
    except (TypeError, ValueError) as error:
        raise DataError('Укажите корректные даты начала и окончания.') from error

    if start_date >= end_date:
        raise DataError('Дата начала должна быть раньше даты окончания.')

    tickers = [ticker.strip() for ticker in tickers if ticker.strip()]

    if not tickers or not re.fullmatch(MONEY_DEFAULT_NAME, tickers[0], re.I):
        market_tickers = [ticker for ticker in tickers if ticker.upper() != MONEY_DEFAULT_NAME]
        tickers = [MONEY_DEFAULT_NAME, *market_tickers]
        warnings.append('Индикатор 1 не был рублёвой массой — подставлен M2RU.')

    if len(tickers) != N_ASSETS:
        raise DataError(f'Нужно 10 индикаторов (M2RU + 9 тикеров), получено {len(tickers)}.')

    if len({ticker.upper() for ticker in tickers}) != N_ASSETS:
        raise DataError('В списке есть повторяющиеся тикеры.')

    if not m2_levels:
        raise DataError(
            'Для M2RU загрузите CSV с уровнями денежной массы (дата; значение) — '
            'в yfinance и MOEX ISS этого ряда нет.'
        )

    money_supply_levels = {}

    for point in m2_levels:
        try:
            period_date = pd.Timestamp(point['date'])
            money_supply_value = float(point['value'])
        except (KeyError, TypeError, ValueError) as error:
            raise DataError('Ряд M2RU должен содержать корректные пары «дата;значение».') from error

        if pd.isna(period_date) or not np.isfinite(money_supply_value) or money_supply_value <= 0:
            raise DataError(
                'Значения M2RU должны быть конечными положительными числами с корректными датами.'
            )

        money_supply_levels[period_date] = money_supply_value

    asset_prices = {
        MONEY_DEFAULT_NAME: pd.Series(money_supply_levels).sort_index(),
    }

    for ticker in tickers[1:]:
        if ticker.upper().startswith('MOEX:'):
            asset_prices[ticker] = _load_moex_prices(ticker[5:], start, end)
        else:
            asset_prices[ticker] = _load_yahoo_prices(ticker, start, end)

    prices_frame = pd.DataFrame(asset_prices).sort_index()
    resample_rule = RESAMPLE_RULE.get(frequency)

    if resample_rule:
        prices_frame = prices_frame.resample(resample_rule).last()

    prices_frame = prices_frame.ffill().dropna()
    returns_frame = prices_frame.pct_change().dropna() * 100.0
    dataset = Dataset(
        columns=list(returns_frame.columns),
        index=[period.date().isoformat() for period in returns_frame.index],
        data=returns_frame.values.tolist(),
        has_dates=True,
    )

    if len(dataset.data) < MIN_OBS:
        warnings.append(
            f'Получено {len(dataset.data)} наблюдений — для анализа нужно не менее {MIN_OBS}.'
        )

    return dataset, warnings


def _load_yahoo_prices(ticker: str, start: str, end: str | None) -> pd.Series:
    import yfinance

    try:
        prices_frame = yfinance.download(
            ticker,
            start=start,
            end=end,
            auto_adjust=True,
            progress=False,
        )
    except Exception as error:
        logger.warning('Yahoo Finance request failed for %s: %s', ticker, error)
        raise DataError(f'Не удалось загрузить котировки {ticker} из Yahoo Finance.') from error

    if prices_frame is None or prices_frame.empty or 'Close' not in prices_frame:
        raise DataError(f'Yahoo Finance не вернул цены закрытия по {ticker}.')

    closing_prices = prices_frame['Close']

    if isinstance(closing_prices, pd.DataFrame):
        closing_prices = closing_prices.iloc[:, 0]

    closing_prices = pd.to_numeric(closing_prices, errors='coerce').dropna()
    closing_prices = closing_prices[closing_prices > 0]

    if closing_prices.empty or not np.isfinite(closing_prices.to_numpy(dtype=float)).all():
        raise DataError(f'В данных Yahoo Finance по {ticker} нет корректных цен.')

    return closing_prices.rename(ticker)


def _load_moex_prices(secid: str, start: str, end: str | None) -> pd.Series:
    import requests

    engine_market = 'stock/shares'
    board_path = '/boards/TQBR'

    if secid.upper() in {'IMOEX', 'RTSI', 'MOEXBC', 'RGBI', 'RGBITR'}:
        engine_market = 'stock/index'
        board_path = ''

    engine_name, market_name = engine_market.split('/')
    url = (
        f'https://iss.moex.com/iss/history/engines/{engine_name}/markets/'
        f'{market_name}{board_path}/securities/{secid}.json'
    )
    closing_prices = {}
    cursor = 0

    while True:
        params = {
            'from': start,
            'start': cursor,
            'iss.meta': 'off',
            'history.columns': 'TRADEDATE,CLOSE',
        }
        if end:
            params['till'] = end

        try:
            response = requests.get(url, params=params, timeout=20)
            response.raise_for_status()
            payload = response.json()
            history = payload.get('history', {})
            rows = history.get('data', [])
        except (requests.RequestException, ValueError, AttributeError) as error:
            logger.warning('MOEX ISS request failed for %s: %s', secid, error)
            raise DataError(f'Не удалось загрузить котировки {secid} с MOEX.') from error

        if not rows:
            break

        for row in rows:
            if not isinstance(row, (list, tuple)) or len(row) < 2 or row[1] is None:
                continue

            try:
                price = float(row[1])
                if np.isfinite(price) and price > 0:
                    closing_prices[pd.Timestamp(row[0])] = price
            except (TypeError, ValueError):
                continue

        cursor += len(rows)

    if not closing_prices:
        raise DataError(f'MOEX ISS не вернул данных по {secid}.')

    return pd.Series(closing_prices).sort_index().rename(f'MOEX:{secid}')
