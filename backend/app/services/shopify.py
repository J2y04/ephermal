import hashlib
import hmac
import urllib.parse
import httpx
from app.config import settings
from app.utils.encryption import encrypt_token, decrypt_token


SHOPIFY_API_VERSION = "2024-01"


def build_install_url(shop: str, state: str | None = None) -> str:
    scopes = settings.SHOPIFY_SCOPES
    redirect = settings.SHOPIFY_REDIRECT_URI
    if state is None:
        state = hashlib.sha256(shop.encode()).hexdigest()[:16]
    params = urllib.parse.urlencode({
        "client_id": settings.SHOPIFY_API_KEY,
        "scope": scopes,
        "redirect_uri": redirect,
        "state": state,
    })
    return f"https://{shop}/admin/oauth/authorize?{params}"


def verify_shopify_hmac(params: dict) -> bool:
    # Work on a copy — never mutate the caller's dict
    params = dict(params)
    received_hmac = params.pop("hmac", "")
    # Shopify signs all params except hmac, joined as key=value sorted by key
    sorted_params = "&".join(f"{k}={v}" for k, v in sorted(params.items()))
    digest = hmac.new(
        settings.SHOPIFY_API_SECRET.encode(),
        sorted_params.encode(),
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(digest, received_hmac)


async def exchange_code_for_token(shop: str, code: str) -> str:
    url = f"https://{shop}/admin/oauth/access_token"
    async with httpx.AsyncClient() as client:
        resp = await client.post(url, json={
            "client_id": settings.SHOPIFY_API_KEY,
            "client_secret": settings.SHOPIFY_API_SECRET,
            "code": code,
        })
        resp.raise_for_status()
        return resp.json()["access_token"]


async def get_shop_info(shop: str, access_token: str) -> dict:
    url = f"https://{shop}/admin/api/{SHOPIFY_API_VERSION}/shop.json"
    async with httpx.AsyncClient() as client:
        resp = await client.get(url, headers={"X-Shopify-Access-Token": access_token})
        resp.raise_for_status()
        return resp.json()["shop"]


async def get_products(shop: str, access_token: str, limit: int = 50) -> list[dict]:
    url = f"https://{shop}/admin/api/{SHOPIFY_API_VERSION}/products.json?limit={limit}&status=active"
    async with httpx.AsyncClient() as client:
        resp = await client.get(url, headers={"X-Shopify-Access-Token": access_token})
        resp.raise_for_status()
        return resp.json()["products"]


async def get_recent_orders(shop: str, access_token: str, days: int = 30) -> list[dict]:
    from datetime import datetime, timedelta, timezone
    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    url = f"https://{shop}/admin/api/{SHOPIFY_API_VERSION}/orders.json?status=any&created_at_min={since}&limit=250"
    async with httpx.AsyncClient() as client:
        resp = await client.get(url, headers={"X-Shopify-Access-Token": access_token})
        resp.raise_for_status()
        return resp.json()["orders"]


def verify_webhook_hmac(body: bytes, hmac_header: str) -> bool:
    digest = hmac.new(
        settings.SHOPIFY_API_SECRET.encode(),
        body,
        hashlib.sha256,
    ).digest()
    import base64
    computed = base64.b64encode(digest).decode()
    return hmac.compare_digest(computed, hmac_header)
