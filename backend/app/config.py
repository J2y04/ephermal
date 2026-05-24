from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = "postgresql+asyncpg://ephermal:password@localhost:5432/ephermal"
    DATABASE_URL_SYNC: str = "postgresql://ephermal:password@localhost:5432/ephermal"

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"
    CELERY_BROKER_URL: str = "redis://localhost:6379/1"

    # Security
    SECRET_KEY: str = "change-me"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    FERNET_KEY: str = ""

    # App
    APP_ENV: str = "production"
    APP_URL: str = "https://ephermal.app"
    MEDIA_DIR: str = "/var/www/ephermal/media"

    # Google OAuth (login)
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GOOGLE_REDIRECT_URI: str = "https://ephermal.app/api/auth/google/callback"

    # Shopify
    SHOPIFY_API_KEY: str = ""
    SHOPIFY_API_SECRET: str = ""
    SHOPIFY_SCOPES: str = "read_products,read_orders,read_customers,read_analytics"
    SHOPIFY_REDIRECT_URI: str = "https://ephermal.app/api/stores/shopify/callback"

    # Meta
    META_APP_ID: str = ""
    META_APP_SECRET: str = ""
    META_REDIRECT_URI: str = "https://ephermal.app/api/stores/meta/callback"

    # Google Ads
    GOOGLE_ADS_CLIENT_ID: str = ""
    GOOGLE_ADS_CLIENT_SECRET: str = ""
    GOOGLE_ADS_DEVELOPER_TOKEN: str = ""
    GOOGLE_ADS_REDIRECT_URI: str = "https://ephermal.app/api/stores/google/callback"

    # Higgsfield
    HIGGSFIELD_API_KEY: str = ""

    # Stripe
    STRIPE_SECRET_KEY: str = ""
    STRIPE_WEBHOOK_SECRET: str = ""
    STRIPE_PRICE_STARTER: str = ""
    STRIPE_PRICE_GROWTH: str = ""
    STRIPE_PRICE_SCALE: str = ""

    # n8n
    N8N_URL: str = "http://localhost:5678"
    N8N_API_KEY: str = ""
    N8N_ORCHESTRATOR_WEBHOOK: str = "http://localhost:5678/webhook/orchestrator"

    class Config:
        env_file = ".env"
        case_sensitive = True


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
