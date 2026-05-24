"""
Shopify Billing API service.

Handles recurring application charges (subscriptions) through the
Shopify Admin REST API so Shopify-App-Store merchants are billed via
Shopify instead of Stripe.

Charge lifecycle:
  1. create_subscription()  → returns a confirmation_url the merchant must visit
  2. Merchant approves → Shopify redirects to SHOPIFY_BILLING_REDIRECT_URI with
     ?charge_id=<id>
  3. activate_charge()      → must be called to activate the charge
  4. cancel_charge()        → cancels an active recurring charge
"""

import httpx
from datetime import datetime, timezone
from app.utils.encryption import decrypt_token
from app.config import settings

API_VERSION = "2024-01"

# Plan prices in USD per 30 days
PLAN_PRICES: dict[str, float] = {
    "starter": 29.00,
    "growth":  79.00,
    "scale":  199.00,
}

PLAN_NAMES: dict[str, str] = {
    "starter": "Ephermal Starter",
    "growth":  "Ephermal Growth",
    "scale":   "Ephermal Scale",
}

TRIAL_DAYS = 7

BILLING_REDIRECT_URI = f"{settings.APP_URL}/api/billing/shopify/callback"


def _headers(access_token: str) -> dict[str, str]:
    return {
        "X-Shopify-Access-Token": access_token,
        "Content-Type": "application/json",
    }


async def create_subscription(
    shop: str,
    access_token_enc: str,
    plan: str,
    return_url: str | None = None,
) -> dict:
    """
    Create a recurring application charge on Shopify.

    Returns the charge dict including ``confirmation_url`` that the merchant
    must be redirected to in order to approve the subscription.
    """
    if plan not in PLAN_PRICES:
        raise ValueError(f"Unknown plan: {plan}")

    access_token = decrypt_token(access_token_enc)
    redirect_url = return_url or f"{BILLING_REDIRECT_URI}?plan={plan}&shop={shop}"

    payload = {
        "recurring_application_charge": {
            "name": PLAN_NAMES[plan],
            "price": PLAN_PRICES[plan],
            "return_url": redirect_url,
            "trial_days": TRIAL_DAYS,
            "test": settings.APP_ENV != "production",
        }
    }

    url = f"https://{shop}/admin/api/{API_VERSION}/recurring_application_charges.json"
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(url, json=payload, headers=_headers(access_token))
        resp.raise_for_status()
        return resp.json()["recurring_application_charge"]


async def get_charge(shop: str, access_token_enc: str, charge_id: int | str) -> dict:
    """Fetch a recurring application charge by ID."""
    access_token = decrypt_token(access_token_enc)
    url = f"https://{shop}/admin/api/{API_VERSION}/recurring_application_charges/{charge_id}.json"
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(url, headers=_headers(access_token))
        resp.raise_for_status()
        return resp.json()["recurring_application_charge"]


async def activate_charge(shop: str, access_token_enc: str, charge_id: int | str) -> dict:
    """
    Activate a recurring application charge after merchant approval.
    Must be called within 48 hours of the merchant accepting.
    """
    access_token = decrypt_token(access_token_enc)
    url = (
        f"https://{shop}/admin/api/{API_VERSION}"
        f"/recurring_application_charges/{charge_id}/activate.json"
    )
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(url, json={}, headers=_headers(access_token))
        resp.raise_for_status()
        return resp.json()["recurring_application_charge"]


async def cancel_charge(shop: str, access_token_enc: str, charge_id: int | str) -> None:
    """Cancel an active recurring application charge."""
    access_token = decrypt_token(access_token_enc)
    url = f"https://{shop}/admin/api/{API_VERSION}/recurring_application_charges/{charge_id}.json"
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.delete(url, headers=_headers(access_token))
        resp.raise_for_status()
