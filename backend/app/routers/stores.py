import secrets as _secrets
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.models.user import User
from app.models.store import Store
from app.schemas.store import StoreOut, BrandVoiceUpdate
from app.routers.deps import get_current_user
from app.utils.encryption import encrypt_token
from app.utils.security import (
    create_install_state, verify_install_state,
    create_oauth_state, verify_oauth_state,
    create_access_token, create_refresh_token,
    hash_password,
)
from app.services import shopify, meta, google_ads_service
from app.config import settings

router = APIRouter(prefix="/api/stores", tags=["stores"])

DASHBOARD = f"{settings.APP_URL}/dashboard.html"
OAUTH_CALLBACK = f"{settings.APP_URL}/auth/oauth-callback.html"
ERROR_URL = f"{settings.APP_URL}/dashboard.html?error="


@router.get("/", response_model=list[StoreOut])
async def list_stores(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Store).where(Store.user_id == user.id, Store.is_active == True))
    return result.scalars().all()


# ── SHOPIFY INSTALL (no auth — works from App Store) ────────────────────────────

@router.get("/install/shopify")
async def shopify_install(shop: str = Query(...)):
    """Entry point for Shopify App Store installs. No authentication required."""
    if not shop.endswith(".myshopify.com"):
        shop = f"{shop}.myshopify.com"
    state = create_install_state(shop)
    url = shopify.build_install_url(shop, state=state)
    return {"redirect_url": url}


@router.get("/shopify/callback")
async def shopify_callback(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Shopify OAuth callback. Auto-creates a user account if this is a new merchant.
    Existing merchants are recognised by their shop domain.
    """
    all_params = dict(request.query_params)
    code = all_params.get("code")
    shop = all_params.get("shop")
    state = all_params.get("state", "")

    if not code or not shop:
        return RedirectResponse(url=f"{ERROR_URL}shopify_missing_params")

    if not shopify.verify_shopify_hmac(all_params):
        return RedirectResponse(url=f"{ERROR_URL}shopify_hmac_invalid")

    if not verify_install_state(state, shop):
        return RedirectResponse(url=f"{ERROR_URL}shopify_state_expired")

    try:
        access_token = await shopify.exchange_code_for_token(shop, code)
        shop_info = await shopify.get_shop_info(shop, access_token)
    except Exception:
        return RedirectResponse(url=f"{ERROR_URL}shopify_token_exchange_failed")

    # ── Find or create user ───────────────────────────────────────────────────
    shop_email = shop_info.get("email") or f"owner@{shop}"
    shop_owner = shop_info.get("shop_owner") or shop_info.get("name", "")

    # Try by email first
    result = await db.execute(select(User).where(User.email == shop_email))
    user = result.scalar_one_or_none()

    # Try by existing store record (handles email-changed merchants)
    if not user:
        result2 = await db.execute(
            select(User).join(Store, Store.user_id == User.id).where(Store.shopify_domain == shop)
        )
        user = result2.scalar_one_or_none()

    if not user:
        # Brand-new merchant — create account automatically
        user = User(
            email=shop_email,
            hashed_password=hash_password(_secrets.token_hex(16)),
            full_name=shop_owner,
            is_verified=True,
            is_active=True,
        )
        db.add(user)
        await db.flush()

    # ── Find or create store ──────────────────────────────────────────────────
    result3 = await db.execute(select(Store).where(Store.shopify_domain == shop))
    store = result3.scalar_one_or_none()

    if not store:
        store = Store(user_id=user.id, shopify_domain=shop)
        db.add(store)
    else:
        store.user_id = user.id  # Reassign on reinstall

    store.shopify_access_token_enc = encrypt_token(access_token)
    store.shopify_shop_id = str(shop_info.get("id", ""))
    store.store_name = shop_info.get("name")
    store.store_currency = shop_info.get("currency", "USD")
    store.shopify_connected = True
    await db.flush()

    # ── Issue JWT and send to dashboard ──────────────────────────────────────
    access_jwt = create_access_token(str(user.id))
    refresh_jwt = create_refresh_token(str(user.id))
    return RedirectResponse(
        url=f"{OAUTH_CALLBACK}?access_token={access_jwt}&refresh_token={refresh_jwt}&shopify=connected"
    )


# ── META ADS ─────────────────────────────────────────────────────────────────

@router.get("/meta/connect")
async def meta_connect(user: User = Depends(get_current_user)):
    state = create_oauth_state(str(user.id))
    url = meta.build_oauth_url(state)
    return {"redirect_url": url}


@router.get("/meta/callback")
async def meta_callback(
    code: str = Query(...),
    state: str = Query(None),
    db: AsyncSession = Depends(get_db),
):
    user_id = verify_oauth_state(state or "")
    if not user_id:
        return RedirectResponse(url=f"{ERROR_URL}meta_state_expired")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        return RedirectResponse(url=f"{ERROR_URL}user_not_found")

    try:
        tokens = await meta.exchange_code_for_token(code)
        long_token = await meta.get_long_lived_token(tokens["access_token"])
        ad_accounts = await meta.get_ad_accounts(long_token)
    except Exception:
        return RedirectResponse(url=f"{ERROR_URL}meta_token_exchange_failed")

    result2 = await db.execute(select(Store).where(Store.user_id == user.id, Store.shopify_connected == True))
    store = result2.scalar_one_or_none()
    if not store:
        return RedirectResponse(url=f"{ERROR_URL}connect_shopify_first")

    store.meta_access_token_enc = encrypt_token(long_token)
    store.meta_ad_account_id = ad_accounts[0]["id"].replace("act_", "") if ad_accounts else None
    store.meta_connected = True
    await db.flush()

    return RedirectResponse(url=f"{DASHBOARD}?meta=connected")


# ── GOOGLE ADS ───────────────────────────────────────────────────────────────

@router.get("/google/connect")
async def google_ads_connect(user: User = Depends(get_current_user)):
    state = create_oauth_state(str(user.id))
    url = google_ads_service.build_oauth_url(state)
    return {"redirect_url": url}


@router.get("/google/callback")
async def google_ads_callback(
    code: str = Query(...),
    state: str = Query(None),
    db: AsyncSession = Depends(get_db),
):
    user_id = verify_oauth_state(state or "")
    if not user_id:
        return RedirectResponse(url=f"{ERROR_URL}google_state_expired")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        return RedirectResponse(url=f"{ERROR_URL}user_not_found")

    try:
        tokens = await google_ads_service.exchange_code_for_tokens(code)
    except Exception:
        return RedirectResponse(url=f"{ERROR_URL}google_token_exchange_failed")

    refresh_token = tokens.get("refresh_token")
    if not refresh_token:
        return RedirectResponse(url=f"{ERROR_URL}google_no_refresh_token")

    result2 = await db.execute(select(Store).where(Store.user_id == user.id, Store.shopify_connected == True))
    store = result2.scalar_one_or_none()
    if not store:
        return RedirectResponse(url=f"{ERROR_URL}connect_shopify_first")

    try:
        customers = await google_ads_service.list_accessible_customers(tokens["access_token"])
    except Exception:
        customers = []

    store.google_refresh_token_enc = encrypt_token(refresh_token)
    store.google_customer_id = customers[0].split("/")[-1] if customers else None
    store.google_connected = True
    await db.flush()

    return RedirectResponse(url=f"{DASHBOARD}?google=connected")


# ── DISCONNECT / BRAND VOICE ──────────────────────────────────────────────────

@router.post("/{store_id}/disconnect/{platform}")
async def disconnect_platform(
    store_id: str,
    platform: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Store).where(Store.id == store_id, Store.user_id == user.id))
    store = result.scalar_one_or_none()
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")

    if platform == "shopify":
        store.shopify_access_token_enc = None
        store.shopify_connected = False
        store.shopify_shop_id = None
    elif platform == "meta":
        store.meta_access_token_enc = None
        store.meta_connected = False
        store.meta_ad_account_id = None
    elif platform == "google":
        store.google_refresh_token_enc = None
        store.google_connected = False
        store.google_customer_id = None
    else:
        raise HTTPException(status_code=400, detail="Unknown platform")

    return {"ok": True}


@router.patch("/{store_id}/brand-voice")
async def update_brand_voice(
    store_id: str,
    body: BrandVoiceUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Store).where(Store.id == store_id, Store.user_id == user.id))
    store = result.scalar_one_or_none()
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    store.brand_voice = body.model_dump(exclude_none=True)
    return {"ok": True}
