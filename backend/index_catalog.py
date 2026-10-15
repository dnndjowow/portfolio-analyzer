"""Fixed, auditable index universe. M2 is deliberately absent."""
INDEX_CATALOG = [
    {'id': 'IMOEX', 'name': 'Индекс Мосбиржи', 'ticker': 'IMOEX', 'currency': 'RUB', 'source': 'MOEX', 'return_type': 'price'},
    {'id': 'MCFTR', 'name': 'Мосбиржа полной доходности', 'ticker': 'MCFTR', 'currency': 'RUB', 'source': 'MOEX', 'return_type': 'total'},
    {'id': 'RGBITR', 'name': 'ОФЗ полной доходности', 'ticker': 'RGBITR', 'currency': 'RUB', 'source': 'MOEX', 'return_type': 'total'},
    {'id': 'RUCBTRNS', 'name': 'Корпоративные облигации', 'ticker': 'RUCBTRNS', 'currency': 'RUB', 'source': 'MOEX', 'return_type': 'total'},
    {'id': 'SP500', 'name': 'S&P 500', 'ticker': '^GSPC', 'currency': 'USD', 'source': 'Yahoo Finance', 'return_type': 'price'},
    {'id': 'NASDAQ100', 'name': 'Nasdaq 100', 'ticker': '^NDX', 'currency': 'USD', 'source': 'Yahoo Finance', 'return_type': 'price'},
    {'id': 'DOW', 'name': 'Dow Jones Industrial Average', 'ticker': '^DJI', 'currency': 'USD', 'source': 'Yahoo Finance', 'return_type': 'price'},
    {'id': 'RUSSELL2000', 'name': 'Russell 2000', 'ticker': '^RUT', 'currency': 'USD', 'source': 'Yahoo Finance', 'return_type': 'price'},
    {'id': 'FTSE100', 'name': 'FTSE 100', 'ticker': '^FTSE', 'currency': 'GBP', 'source': 'Yahoo Finance', 'return_type': 'price'},
    {'id': 'NIKKEI225', 'name': 'Nikkei 225', 'ticker': '^N225', 'currency': 'JPY', 'source': 'Yahoo Finance', 'return_type': 'price'},
]
INDEX_BY_ID = {item['id']: item for item in INDEX_CATALOG}
