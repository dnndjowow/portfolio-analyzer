import logging
import os
import re
from pathlib import Path

from dotenv import load_dotenv


load_dotenv(Path(__file__).resolve().parents[1] / '.env')

LOG_LEVEL = os.getenv('LOG_LEVEL', 'INFO')
CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv('CORS_ORIGINS', '*').split(',')
]

logging.basicConfig(
    level=LOG_LEVEL,
    format='%(asctime)s %(levelname)s %(name)s: %(message)s',
)

N_ASSETS = 10
MIN_OBS = 30
PERIODS_PER_YEAR = {
    'daily': 252,
    'weekly': 52,
    'monthly': 12,
    'quarterly': 4,
    'yearly': 1,
}
RESAMPLE_RULE = {
    'weekly': 'W-FRI',
    'monthly': 'ME',
    'quarterly': 'QE',
    'yearly': 'YE',
}
MONEY_RE = re.compile(r'(m2|денежн|рубл[её]в|money\s*supply)', re.I)
MONEY_DEFAULT_NAME = 'M2RU'
