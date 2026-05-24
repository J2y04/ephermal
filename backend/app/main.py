from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from app.config import settings
from app.database import engine, Base
from app.routers import auth, stores, campaigns, creatives, analytics, billing, webhooks

limiter = Limiter(key_func=get_remote_address, default_limits=["200/minute"])


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create tables on startup (use Alembic for production migrations)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    await engine.dispose()


app = FastAPI(
    title="Ephermal API",
    version="1.0.0",
    docs_url="/api/docs" if settings.APP_ENV != "production" else None,
    redoc_url="/api/redoc" if settings.APP_ENV != "production" else None,
    openapi_url="/api/openapi.json" if settings.APP_ENV != "production" else None,
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS — tighten in production
origins = (
    ["https://ephermal.app", "https://www.ephermal.app"]
    if settings.APP_ENV == "production"
    else ["http://localhost:3000", "http://127.0.0.1:5500", "null"]
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

if settings.APP_ENV == "production":
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=["ephermal.app", "www.ephermal.app"])

# Routers
app.include_router(auth.router)
app.include_router(stores.router)
app.include_router(campaigns.router)
app.include_router(creatives.router)
app.include_router(analytics.router)
app.include_router(billing.router)
app.include_router(webhooks.router)


@app.get("/api/health")
async def health():
    return {"status": "ok", "env": settings.APP_ENV}
