import numpy as np
import pandas as pd
import pytest

import data_loader as loader
from main import app
from fastapi.testclient import TestClient


def test_csv_headers_are_preserved_without_injecting_an_indicator():
    dataset, warnings = loader.parse_csv(b'Date;SPY;TLT\n2020-01-31;1,5;-0,2\n2020-02-29;2;3\n')
    assert dataset.columns == ['SPY', 'TLT']
    assert dataset.data == [[1.5, -0.2], [2, 3]]
    assert dataset.has_dates
    assert warnings == []


def test_old_file_with_excluded_indicator_is_rejected():
    with pytest.raises(loader.DataError, match='M2'):
        loader.parse_csv(b'Date;M2RU;SPY\n2020-01-31;1;2\n')


def test_tickers_use_real_price_loader_without_money_supply(monkeypatch):
    index = pd.date_range('2020-01-01', '2023-12-31', freq='D')
    calls = []
    def yahoo(ticker, start, end):
        calls.append((ticker, start, end))
        return pd.Series(np.arange(len(index)) + (100 if ticker == 'SPY' else 200), index=index)
    monkeypatch.setattr(loader, '_load_yahoo_prices', yahoo)
    dataset, warnings = loader.load_tickers(['SPY', 'TLT'], '2020-01-01', '2024-01-01', 'monthly')
    assert dataset.columns == ['SPY', 'TLT']
    assert len(dataset.data) == 47
    assert dataset.index[0] == '2020-02-29'
    assert dataset.index[-1] == '2023-12-31'
    assert set(t for t, *_ in calls) == {'SPY', 'TLT'}
    expected = (159 / 130 - 1) * 100
    assert dataset.data[0][0] == pytest.approx(expected)
    assert any('исторические' in warning for warning in warnings)


def test_market_loader_does_not_fill_missing_months_or_include_partial_month(monkeypatch):
    prices = pd.Series([100, 120, 150, 180], index=pd.to_datetime(['2020-01-31', '2020-03-31', '2020-04-30', '2020-05-05']))
    monkeypatch.setattr(loader, '_load_yahoo_prices', lambda *args: prices)
    dataset, _ = loader.load_tickers(['SPY', 'TLT'], '2020-01-01', '2020-05-10', 'monthly')
    assert dataset.index == ['2020-04-30']
    assert dataset.data[0] == pytest.approx([25, 25])


def test_moex_pagination_and_returned_column_order(monkeypatch):
    import requests
    cursors = []
    pages = [
        [[100, '2020-01-02'], [None, '2020-01-03']],
        [[110, '2020-01-06']],
        [],
    ]
    class Response:
        def raise_for_status(self):
            pass
        def json(self):
            return {'history': {'columns': ['CLOSE', 'TRADEDATE'], 'data': pages.pop(0)}}
    def get(url, params, timeout):
        assert '/boards/TQBR/securities/SBER.json' in url
        assert params['till'] == '2020-01-31'
        cursors.append(params['start'])
        return Response()
    monkeypatch.setattr(requests, 'get', get)
    prices = loader._load_moex_prices('SBER', '2020-01-01', '2020-01-31')
    assert cursors == [0, 2, 3]
    assert prices.tolist() == [100, 110]


def test_yahoo_adjusted_close_and_multiindex(monkeypatch):
    import yfinance
    frame = pd.DataFrame([[100], [110]], index=pd.to_datetime(['2020-01-02', '2020-01-03']), columns=pd.MultiIndex.from_tuples([('Close', 'SPY')]))
    def download(ticker, **kwargs):
        assert kwargs['auto_adjust'] is True
        assert kwargs['timeout'] == 20
        return frame
    monkeypatch.setattr(yfinance, 'download', download)
    assert loader._load_yahoo_prices('SPY', '2020-01-01', '2020-02-01').tolist() == [100, 110]


@pytest.mark.parametrize('tickers', [['SPY', 'spy'], ['M2RU', 'SPY'], ['MOEX:', 'SPY']])
def test_invalid_tickers_are_rejected_before_network_access(tickers, monkeypatch):
    monkeypatch.setattr(loader, '_load_yahoo_prices', lambda *args: pytest.fail('Unexpected network access'))
    with pytest.raises(loader.DataError):
        loader.load_tickers(tickers, '2020-01-01', '2024-01-01', 'monthly')


def test_data_source_error_is_not_replaced_with_synthetic_data(monkeypatch):
    def fail(*args):
        raise loader.DataError('Источник котировок недоступен')
    monkeypatch.setattr(loader, '_load_yahoo_prices', fail)
    response = TestClient(app).post('/api/load-tickers', json={'tickers': ['SPY', 'TLT']})
    assert response.status_code == 422
    assert 'Источник котировок недоступен' in response.json()['detail']


def test_ticker_response_reports_frequency(monkeypatch):
    index = pd.date_range('2020-01-01', periods=50, freq='D')
    monkeypatch.setattr(loader, '_load_yahoo_prices', lambda *args: pd.Series(np.arange(50) + 100, index=index))
    response = TestClient(app).post('/api/load-tickers', json={'tickers': ['SPY', 'TLT'], 'start': '2020-01-01', 'end': '2020-03-01', 'frequency': 'daily'})
    assert response.status_code == 200
    assert response.json()['frequency'] == 'daily'
    assert response.json()['n_obs'] == 49
