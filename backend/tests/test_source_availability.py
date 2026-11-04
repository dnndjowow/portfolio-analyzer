import pytest
import requests

from data_loader import DataError
import market_indices


def test_rosstat_maintenance_page_is_not_reported_as_a_broken_data_link(monkeypatch):
    response = requests.Response()
    response.status_code = 404
    response._content = '<html>Сайт Росстата временно недоступен — ведутся технические работы</html>'.encode()
    monkeypatch.setattr(requests.Session, 'get', lambda *args, **kwargs: response)
    with pytest.raises(DataError, match='технические работы'):
        market_indices._get(market_indices.ROSSTAT_URL, rosstat=True)


def test_normal_http_errors_still_report_source_unavailability(monkeypatch):
    response = requests.Response()
    response.status_code = 503
    response._content = b'Service unavailable'
    monkeypatch.setattr(requests.Session, 'get', lambda *args, **kwargs: response)
    with pytest.raises(DataError, match='недоступен'):
        market_indices._get(market_indices.ROSSTAT_URL, rosstat=True)


def test_regular_page_can_mention_unrelated_maintenance_news(monkeypatch):
    response = requests.Response()
    response.status_code = 200
    response._content = '<html>Росстат: новости. Технические работы завершены.</html>'.encode()
    monkeypatch.setattr(requests.Session, 'get', lambda *args, **kwargs: response)
    assert market_indices._get(market_indices.ROSSTAT_URL, rosstat=True) == response.content
