import copy
import io
from datetime import datetime
from xml.etree import ElementTree
from zipfile import ZIP_DEFLATED, ZipFile

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient
from openpyxl import Workbook

import data_loader
from main import app
from schemas.data import Dataset, Settings


@pytest.fixture
def payload():
    dates = pd.date_range('2020-01-31', periods=96, freq='ME')
    return {
        'returns': {
            'columns': ['A', 'B'], 'has_dates': True,
            'index': [date.date().isoformat() for date in dates],
            'data': [[0.5 + float(np.sin(i)), 0.3 + float(np.cos(i))] for i in range(96)],
        },
        'settings': {'units': 'percent', 'frequency': 'monthly', 'inflation': {'annual_rate': 0}},
        'risk_free': 0, 'weights': [0.5, 0.5],
    }


def test_two_observations_cannot_become_sufficient_history_by_resampling(payload):
    payload['returns']['index'] = ['2000-01-31', '2020-01-31']
    payload['returns']['data'] = [[1, 2], [3, 4]]
    payload['settings']['resample_to'] = 'quarterly'
    response = TestClient(app).post('/api/portfolio/metrics', json=payload)
    assert response.status_code == 422
    assert '30' in response.json()['detail']


@pytest.mark.parametrize('frequency', ['monthly', 'daily'])
def test_empty_quarters_are_rejected_instead_of_filled_with_zero(payload, frequency):
    rule = 'ME' if frequency == 'monthly' else 'B'
    dates = pd.date_range('2000-01-31', periods=48, freq=rule).append(pd.date_range('2020-01-31', periods=48, freq=rule))
    payload['returns']['index'] = [date.date().isoformat() for date in dates]
    payload['settings']['frequency'] = frequency
    payload['settings']['resample_to'] = 'quarterly'
    response = TestClient(app).post('/api/portfolio/metrics', json=payload)
    assert response.status_code == 422
    assert 'периоды без наблюдений' in response.json()['detail']


def test_regular_monthly_history_compounds_into_real_quarters(payload):
    settings = Settings(**payload['settings'], resample_to='quarterly')
    frame, _ = data_loader.preprocess(Dataset(**payload['returns']), settings)
    expected = np.prod(1 + np.asarray(payload['returns']['data'][:3]) / 100, axis=0) - 1
    assert len(frame) == 32
    assert frame.iloc[0].to_numpy() == pytest.approx(expected)


def test_a_missing_month_cannot_be_hidden_inside_a_nonempty_quarter(payload):
    payload['returns']['index'].pop(1)
    payload['returns']['data'].pop(1)
    payload['settings']['resample_to'] = 'quarterly'
    response = TestClient(app).post('/api/portfolio/metrics', json=payload)
    assert response.status_code == 422
    assert 'периоды без наблюдений' in response.json()['detail']


@pytest.mark.parametrize('units, value', [('percent', -150), ('fraction', -1.5)])
def test_impossible_asset_losses_are_rejected(payload, units, value):
    payload['settings']['units'] = units
    payload['returns']['data'][0][0] = value
    response = TestClient(app).post('/api/portfolio/metrics', json=payload)
    assert response.status_code == 422
    assert '100%' in response.json()['detail']


def test_complete_loss_is_valid_but_never_makes_capital_negative(payload):
    payload['returns']['data'][0] = [-100, -100]
    response = TestClient(app).post('/api/portfolio/metrics', json=payload)
    assert response.status_code == 200
    assert response.json()['metrics']['curve'][1:] == [0] * 96


@pytest.mark.parametrize('annual_rate', [-1, -1.01])
def test_impossible_annual_inflation_is_rejected(payload, annual_rate):
    payload['settings']['inflation']['annual_rate'] = annual_rate
    assert TestClient(app).post('/api/portfolio/metrics', json=payload).status_code == 422


@pytest.mark.parametrize('units,value', [('percent', -100), ('fraction', -1)])
def test_impossible_period_inflation_is_rejected(payload, units, value):
    payload['settings']['units'] = units
    payload['settings']['inflation'] = {'source': 'series', 'series': [value] * 96}
    response = TestClient(app).post('/api/portfolio/metrics', json=payload)
    assert response.status_code == 422
    assert 'Инфляция за каждый период' in response.json()['detail']


def test_invalid_and_duplicate_dates_are_client_errors(payload):
    client = TestClient(app, raise_server_exceptions=False)
    for date in ['not-a-date', '', payload['returns']['index'][0]]:
        body = copy.deepcopy(payload)
        body['returns']['index'][-1] = date
        response = client.post('/api/portfolio/metrics', json=body)
        assert response.status_code == 422


def test_missing_date_is_rejected_during_csv_upload():
    response = TestClient(app).post('/api/upload', files={'file': ('returns.csv', b'Date;A;B\n2020-01-31;1;2\n;3;4\n')})
    assert response.status_code == 422
    assert 'дата' in response.json()['detail']


def test_sorting_dates_keeps_inflation_aligned_with_original_observations(payload):
    inflation = np.linspace(0.1, 0.9, 96)
    expected = (1 + np.asarray(payload['returns']['data']) / 100) / (1 + inflation[:, None] / 100) - 1
    dataset = copy.deepcopy(payload['returns'])
    dataset['data'].reverse()
    dataset['index'].reverse()
    settings = Settings(inflation={'source': 'series', 'series': inflation[::-1].tolist()})
    frame, warnings = data_loader.preprocess(Dataset(**dataset), settings)
    assert frame.to_numpy() == pytest.approx(expected)
    assert frame.index.is_monotonic_increasing
    assert any('отсортированы' in warning for warning in warnings)


def formula_workbook(*, cached):
    workbook = Workbook()
    sheet = workbook.active
    sheet.append(['Дата', 'A', 'B'])
    for i in range(36):
        sheet.append([datetime(2020 + i // 12, i % 12 + 1, 1), f'={i + 1}/10', f'={i + 1}/20'])
    stream = io.BytesIO()
    workbook.save(stream)
    if not cached:
        return stream.getvalue()
    output = io.BytesIO()
    ns = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
    with ZipFile(io.BytesIO(stream.getvalue())) as source, ZipFile(output, 'w', compression=ZIP_DEFLATED) as target:
        for member in source.infolist():
            content = source.read(member.filename)
            if member.filename == 'xl/worksheets/sheet1.xml':
                xml = ElementTree.fromstring(content)
                for cell in xml.findall('.//s:c', ns):
                    formula = cell.find('s:f', ns)
                    if formula is not None:
                        numerator, denominator = formula.text.split('/')
                        cell.find('s:v', ns).text = str(float(numerator) / float(denominator))
                content = ElementTree.tostring(xml)
            target.writestr(member, content)
    return output.getvalue()


def test_excel_reads_cached_formula_results_as_observations():
    response = TestClient(app).post('/api/upload', files={'file': ('formulas.xlsx', formula_workbook(cached=True))})
    assert response.status_code == 200
    assert response.json()['n_obs'] == 36
    assert response.json()['dataset']['data'][0] == pytest.approx([0.1, 0.05])


def test_excel_formulas_without_saved_results_explain_how_to_fix_file():
    response = TestClient(app).post('/api/upload', files={'file': ('formulas.xlsx', formula_workbook(cached=False))})
    assert response.status_code == 422
    assert 'Пересчитайте и сохраните файл' in response.json()['detail']


def test_labeled_excel_summary_is_not_an_observation():
    workbook = Workbook()
    sheet = workbook.active
    sheet.append(['Дата', 'A', 'B'])
    for i in range(36):
        sheet.append([datetime(2020 + i // 12, i % 12 + 1, 1), i / 10, i / 20])
    sheet.append(['Итого', '=SUM(B2:B37)', '=SUM(C2:C37)'])
    stream = io.BytesIO()
    workbook.save(stream)
    dataset, _ = data_loader.parse_excel(stream.getvalue())
    assert len(dataset.data) == 36
