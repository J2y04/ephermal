from pydantic import BaseModel
from app.models.campaign import CampaignStatus, CampaignPlatform
import uuid
from datetime import datetime


class CampaignCreate(BaseModel):
    name: str
    platform: CampaignPlatform = CampaignPlatform.meta
    daily_budget: float | None = None
    products: list[str] | None = None  # Shopify product IDs
    config: dict | None = None


class CampaignOut(BaseModel):
    id: uuid.UUID
    name: str
    platform: CampaignPlatform
    status: CampaignStatus
    daily_budget: float | None
    total_spend: float
    roas: float | None
    impressions: int
    clicks: int
    conversions: int
    ctr: float | None
    created_at: datetime
    launched_at: datetime | None

    model_config = {"from_attributes": True}


class CreativeOut(BaseModel):
    id: uuid.UUID
    type: str
    status: str
    headline: str | None
    description: str | None
    cta: str | None
    thumbnail_url: str | None
    file_url: str | None
    impressions: int
    clicks: int
    spend: float
    roas: float | None
    created_at: datetime

    model_config = {"from_attributes": True}
