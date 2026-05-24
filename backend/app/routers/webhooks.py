import json
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Request, HTTPException, Header
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from fastapi import Depends
from app.database import get_db
from app.models.billing import Subscription, CreditTransaction, SubStatus, PlanTier
from app.models.store import Store
from app.models.user import User
from app.services import shopify as shopify_service, stripe_service
from app.config import settings as app_settings

logger = logging.getLogger("ephermal")

router = APIRouter(prefix="/api/webhooks", tags=["webhooks"])

STRIPE_EVENT_HANDLERS = {
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
    "checkout.session.completed",
}


@router.post("/stripe")
async def stripe_webhook(
    request: Request,
    stripe_signature: str = Header(None, alias="stripe-signature"),
    db: AsyncSession = Depends(get_db),
):
    body = await request.body()
    try:
        event = stripe_service.construct_webhook_event(body, stripe_signature)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid signature")

    if event["type"] == "checkout.session.completed":
        session = event["data"]["object"]
        await _handle_checkout_completed(session, db)

    elif event["type"] in ("customer.subscription.created", "customer.subscription.updated"):
        sub_data = event["data"]["object"]
        await _handle_subscription_upsert(sub_data, db)

    elif event["type"] == "customer.subscription.deleted":
        sub_data = event["data"]["object"]
        await _handle_subscription_deleted(sub_data, db)

    return {"ok": True}


async def _handle_checkout_completed(session: dict, db: AsyncSession):
    meta = session.get("metadata", {})
    if meta.get("type") == "credits":
        customer_id = session["customer"]
        credits = int(meta.get("credits", 0))
        pack = meta.get("pack", "")
        payment_intent = session.get("payment_intent", "")

        result = await db.execute(
            select(User).join(Subscription, Subscription.user_id == User.id).where(Subscription.stripe_customer_id == customer_id)
        )
        user = result.scalar_one_or_none()
        if user:
            txn = CreditTransaction(
                user_id=user.id,
                amount=credits,
                description=f"Credit pack purchase — {pack} credits",
                reference=pack,
                stripe_payment_intent_id=payment_intent,
            )
            db.add(txn)


async def _handle_subscription_upsert(sub_data: dict, db: AsyncSession):
    stripe_sub_id = sub_data["id"]
    stripe_customer_id = sub_data["customer"]
    status_map = {"active": SubStatus.active, "past_due": SubStatus.past_due, "trialing": SubStatus.trialing}
    status = status_map.get(sub_data["status"], SubStatus.past_due)

    price_id = sub_data["items"]["data"][0]["price"]["id"]
    reverse_map = {v: k for k, v in stripe_service.PLAN_PRICES.items() if v}
    plan_str = reverse_map.get(price_id, "starter")
    plan = PlanTier(plan_str)

    # Try to find existing subscription row by sub ID, then by customer ID
    result = await db.execute(select(Subscription).where(Subscription.stripe_subscription_id == stripe_sub_id))
    sub = result.scalar_one_or_none()

    if not sub:
        result2 = await db.execute(select(Subscription).where(Subscription.stripe_customer_id == stripe_customer_id))
        sub = result2.scalar_one_or_none()

    if not sub:
        # No row yet — find user by email via Stripe customer object (fallback)
        import stripe as stripe_lib  # noqa: PLC0415 — lazy import avoids circular dep with stripe SDK init
        stripe_lib.api_key = app_settings.STRIPE_SECRET_KEY
        try:
            customer = stripe_lib.Customer.retrieve(stripe_customer_id)
            user_email = customer.get("email")
        except Exception:
            user_email = None

        if user_email:
            result3 = await db.execute(select(User).where(User.email == user_email))
            user = result3.scalar_one_or_none()
            if user:
                sub = Subscription(user_id=user.id, stripe_customer_id=stripe_customer_id)
                db.add(sub)

    if sub:
        sub.stripe_subscription_id = stripe_sub_id
        sub.stripe_customer_id = stripe_customer_id
        sub.plan = plan
        sub.status = status
        sub.current_period_start = datetime.fromtimestamp(sub_data["current_period_start"], tz=timezone.utc)
        sub.current_period_end = datetime.fromtimestamp(sub_data["current_period_end"], tz=timezone.utc)
        sub.cancel_at_period_end = sub_data.get("cancel_at_period_end", False)


async def _handle_subscription_deleted(sub_data: dict, db: AsyncSession):
    stripe_sub_id = sub_data["id"]
    result = await db.execute(select(Subscription).where(Subscription.stripe_subscription_id == stripe_sub_id))
    sub = result.scalar_one_or_none()
    if sub:
        sub.status = SubStatus.canceled


@router.post("/shopify/products")
async def shopify_product_webhook(request: Request, x_shopify_hmac_sha256: str = Header(None)):
    body = await request.body()
    if not shopify_service.verify_webhook_hmac(body, x_shopify_hmac_sha256 or ""):
        raise HTTPException(status_code=401, detail="Invalid HMAC")
    return {"ok": True}


@router.post("/shopify/orders")
async def shopify_order_webhook(request: Request, x_shopify_hmac_sha256: str = Header(None)):
    body = await request.body()
    if not shopify_service.verify_webhook_hmac(body, x_shopify_hmac_sha256 or ""):
        raise HTTPException(status_code=401, detail="Invalid HMAC")
    return {"ok": True}


# ── MANDATORY GDPR WEBHOOKS ────────────────────────────────────────────────────
# Shopify requires these three endpoints for any app that handles customer data.
# Failure to implement them will result in app rejection / suspension.

@router.post("/shopify/customers/data_request")
async def customers_data_request(request: Request, x_shopify_hmac_sha256: str = Header(None)):
    """Merchant or customer requests a copy of their data. Respond within 30 days."""
    body = await request.body()
    if not shopify_service.verify_webhook_hmac(body, x_shopify_hmac_sha256 or ""):
        raise HTTPException(status_code=401, detail="Invalid HMAC")
    # Log the request — in production, email hello@ephermal.app with the payload
    logger.info("GDPR data_request: %s", json.loads(body))
    return {"ok": True}


@router.post("/shopify/customers/redact")
async def customers_redact(
    request: Request,
    x_shopify_hmac_sha256: str = Header(None),
    db: AsyncSession = Depends(get_db),
):
    """Shopify asks us to delete a specific customer's data."""
    body = await request.body()
    if not shopify_service.verify_webhook_hmac(body, x_shopify_hmac_sha256 or ""):
        raise HTTPException(status_code=401, detail="Invalid HMAC")
    # We store no individual customer PII — only store-level data.
    # Nothing to delete; acknowledge immediately.
    return {"ok": True}


@router.post("/shopify/shop/redact")
async def shop_redact(
    request: Request,
    x_shopify_hmac_sha256: str = Header(None),
    db: AsyncSession = Depends(get_db),
):
    """48 hours after app uninstall Shopify asks us to delete all shop data."""
    body = await request.body()
    if not shopify_service.verify_webhook_hmac(body, x_shopify_hmac_sha256 or ""):
        raise HTTPException(status_code=401, detail="Invalid HMAC")

    payload = json.loads(body)
    shop_domain = payload.get("myshopify_domain", "")

    if shop_domain:
        result = await db.execute(select(Store).where(Store.shopify_domain == shop_domain))
        store = result.scalar_one_or_none()
        if store:
            store.shopify_access_token_enc = None
            store.shopify_connected = False
            store.is_active = False

    return {"ok": True}


@router.post("/shopify/app/uninstalled")
async def app_uninstalled(
    request: Request,
    x_shopify_hmac_sha256: str = Header(None),
    db: AsyncSession = Depends(get_db),
):
    """Fired immediately when a merchant uninstalls the app."""
    body = await request.body()
    if not shopify_service.verify_webhook_hmac(body, x_shopify_hmac_sha256 or ""):
        raise HTTPException(status_code=401, detail="Invalid HMAC")

    payload = json.loads(body)
    shop_domain = payload.get("myshopify_domain", "")

    if shop_domain:
        result = await db.execute(select(Store).where(Store.shopify_domain == shop_domain))
        store = result.scalar_one_or_none()
        if store:
            # Revoke token immediately, keep store record for 48h until shop/redact fires
            store.shopify_access_token_enc = None
            store.shopify_connected = False

    return {"ok": True}
