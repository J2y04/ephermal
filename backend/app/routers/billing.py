from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.models.user import User
from app.models.store import Store
from app.models.billing import Subscription, CreditTransaction, PlanTier, SubStatus
from app.schemas.billing import (
    SubscriptionOut, CheckoutRequest, CreditPackRequest,
    CreditTransactionOut, ShopifySubscribeRequest,
)
from app.routers.deps import get_current_user
from app.services import stripe_service, shopify_billing
from app.config import settings

DASHBOARD = f"{settings.APP_URL}/dashboard.html"
ERROR_URL = f"{settings.APP_URL}/dashboard.html?error="

router = APIRouter(prefix="/api/billing", tags=["billing"])


@router.get("/subscription", response_model=SubscriptionOut | None)
async def get_subscription(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Subscription).where(Subscription.user_id == user.id))
    return result.scalar_one_or_none()


@router.post("/checkout")
async def create_checkout(
    body: CheckoutRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    price_map = {
        PlanTier.starter: stripe_service.PLAN_PRICES["starter"],
        PlanTier.growth:  stripe_service.PLAN_PRICES["growth"],
        PlanTier.scale:   stripe_service.PLAN_PRICES["scale"],
    }
    price_id = price_map.get(body.plan)
    if not price_id:
        raise HTTPException(status_code=400, detail="Invalid plan")

    customer_id = await stripe_service.get_or_create_customer(user.email, user.full_name)

    # Persist customer_id now so the webhook can look up the user when subscription is created
    result = await db.execute(select(Subscription).where(Subscription.user_id == user.id))
    sub = result.scalar_one_or_none()
    if not sub:
        sub = Subscription(user_id=user.id, stripe_customer_id=customer_id)
        db.add(sub)
    elif not sub.stripe_customer_id:
        sub.stripe_customer_id = customer_id
    await db.flush()

    url = await stripe_service.create_checkout_session(customer_id, price_id, body.success_url, body.cancel_url)
    return {"checkout_url": url}


@router.post("/credits/checkout")
async def buy_credits(
    body: CreditPackRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    customer_id = await stripe_service.get_or_create_customer(user.email, user.full_name)
    url = await stripe_service.create_credit_payment(
        customer_id,
        body.pack,
        success_url=f"{settings.APP_URL}/dashboard.html?credits=purchased",
        cancel_url=f"{settings.APP_URL}/dashboard.html",
    )
    return {"checkout_url": url}


@router.get("/credits/balance")
async def credit_balance(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(CreditTransaction).where(CreditTransaction.user_id == user.id))
    txns = result.scalars().all()
    balance = sum(t.amount for t in txns)
    return {"balance": balance}


@router.get("/credits/transactions", response_model=list[CreditTransactionOut])
async def credit_transactions(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(CreditTransaction).where(CreditTransaction.user_id == user.id).order_by(CreditTransaction.created_at.desc()).limit(50)
    )
    return result.scalars().all()


@router.post("/cancel")
async def cancel_subscription(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Subscription).where(Subscription.user_id == user.id))
    sub = result.scalar_one_or_none()
    if not sub:
        raise HTTPException(status_code=404, detail="No active subscription")

    if sub.billing_provider == "shopify":
        # Cancel via Shopify Billing API
        store_result = await db.execute(
            select(Store).where(Store.user_id == user.id, Store.shopify_connected == True)
        )
        store = store_result.scalar_one_or_none()
        if store and sub.shopify_charge_id:
            try:
                await shopify_billing.cancel_charge(
                    store.shopify_domain,
                    store.shopify_access_token_enc,
                    sub.shopify_charge_id,
                )
            except Exception:
                raise HTTPException(status_code=502, detail="Shopify billing cancel failed")
        sub.status = SubStatus.canceled
        sub.cancel_at_period_end = True
    else:
        if not sub.stripe_subscription_id:
            raise HTTPException(status_code=404, detail="No active subscription")
        await stripe_service.cancel_subscription(sub.stripe_subscription_id)
        sub.cancel_at_period_end = True

    return {"ok": True, "message": "Subscription will cancel at period end"}


# ── SHOPIFY BILLING ────────────────────────────────────────────────────────────

@router.post("/shopify/subscribe")
async def shopify_subscribe(
    body: ShopifySubscribeRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Initiate a Shopify recurring charge for the given plan.
    Returns a confirmation_url the merchant must visit to approve billing.
    """
    store_result = await db.execute(
        select(Store).where(Store.user_id == user.id, Store.shopify_connected == True)
    )
    store = store_result.scalar_one_or_none()
    if not store:
        raise HTTPException(status_code=400, detail="Connect your Shopify store first")

    try:
        charge = await shopify_billing.create_subscription(
            shop=store.shopify_domain,
            access_token_enc=store.shopify_access_token_enc,
            plan=body.plan.value,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Shopify billing error: {exc}")

    # Store the pending charge id so the callback can find it
    sub_result = await db.execute(select(Subscription).where(Subscription.user_id == user.id))
    sub = sub_result.scalar_one_or_none()
    if not sub:
        sub = Subscription(user_id=user.id, billing_provider="shopify")
        db.add(sub)
    sub.shopify_charge_id = str(charge["id"])
    sub.billing_provider = "shopify"
    sub.plan = body.plan
    sub.status = SubStatus.trialing
    await db.flush()

    return {"confirmation_url": charge["confirmation_url"]}


@router.get("/shopify/callback")
async def shopify_billing_callback(
    charge_id: int = Query(...),
    plan: str = Query(...),
    shop: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """
    Shopify redirects here after the merchant approves or declines billing.
    Activate the charge, update the subscription record, then redirect to dashboard.
    """
    store_result = await db.execute(
        select(Store).where(Store.shopify_domain == shop, Store.shopify_connected == True)
    )
    store = store_result.scalar_one_or_none()
    if not store:
        return RedirectResponse(url=f"{ERROR_URL}store_not_found")

    try:
        charge = await shopify_billing.get_charge(
            store.shopify_domain, store.shopify_access_token_enc, charge_id
        )
    except Exception:
        return RedirectResponse(url=f"{ERROR_URL}shopify_billing_fetch_failed")

    if charge.get("status") != "accepted":
        return RedirectResponse(url=f"{ERROR_URL}shopify_billing_declined")

    try:
        charge = await shopify_billing.activate_charge(
            store.shopify_domain, store.shopify_access_token_enc, charge_id
        )
    except Exception:
        return RedirectResponse(url=f"{ERROR_URL}shopify_billing_activate_failed")

    sub_result = await db.execute(
        select(Subscription).where(Subscription.user_id == store.user_id)
    )
    sub = sub_result.scalar_one_or_none()
    if not sub:
        sub = Subscription(user_id=store.user_id, billing_provider="shopify")
        db.add(sub)

    sub.shopify_charge_id = str(charge_id)
    sub.billing_provider = "shopify"
    sub.plan = PlanTier(plan) if plan in PlanTier._value2member_map_ else sub.plan
    sub.status = SubStatus.active

    return RedirectResponse(url=f"{DASHBOARD}?billing=activated")
