from pydantic import BaseModel
from app.models.billing import PlanTier, SubStatus
import uuid
from datetime import datetime


class SubscriptionOut(BaseModel):
    id: uuid.UUID
    plan: PlanTier
    status: SubStatus
    current_period_end: datetime | None
    cancel_at_period_end: bool
    billing_provider: str = "stripe"
    shopify_charge_id: str | None = None

    model_config = {"from_attributes": True}


class CheckoutRequest(BaseModel):
    plan: PlanTier
    success_url: str = "https://ephermal.app/dashboard?checkout=success"
    cancel_url: str = "https://ephermal.app/pricing"


class CreditPackRequest(BaseModel):
    pack: str  # "100", "500", "1000"


class CreditTransactionOut(BaseModel):
    id: uuid.UUID
    amount: int
    description: str
    created_at: datetime

    model_config = {"from_attributes": True}


class ShopifySubscribeRequest(BaseModel):
    plan: PlanTier


class ShopifyBillingCallbackParams(BaseModel):
    charge_id: int
    plan: str
    store_id: str
