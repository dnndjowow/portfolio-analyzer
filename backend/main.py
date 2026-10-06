from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import CORS_ORIGINS
from routers import data, portfolio, support, health


app = FastAPI(
    title='Портфель API',
    version='1.0.0',
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=['*'],
    allow_headers=['*'],
)

app.include_router(health.router)
app.include_router(data.router)
app.include_router(portfolio.router)
app.include_router(support.router)
