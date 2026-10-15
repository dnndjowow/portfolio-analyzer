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

MIN_ASSETS = 2
MAX_ASSETS = 50
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
# M2 — только отдельный ориентир. В ряды портфеля и оптимизацию он не входит.
EXCLUDED_INDICATOR_RE = re.compile(
    r'(^[mм]2(?:ru)?$|^[mм]²$|modigliani|модильяни|денежн\w*\s+масс|money\s*supply)', re.I,
)
