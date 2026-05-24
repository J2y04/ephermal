from pydantic import BaseModel
import uuid


class StoreOut(BaseModel):
    id: uuid.UUID
    shopify_domain: str | None
    store_name: str | None
    store_currency: str
    store_niche: str | None
    shopify_connected: bool
    meta_connected: bool
    google_connected: bool
    meta_ad_account_id: str | None
    google_customer_id: str | None

    model_config = {"from_attributes": True}


class BrandVoiceUpdate(BaseModel):
    tone: str | None = None        # "playful", "professional", "bold"
    keywords: list[str] | None = None
    avoid: list[str] | None = None
    tagline: str | None = None


class ShopifyInstallRequest(BaseModel):
    shop: str  # e.g. mystore.myshopify.com
