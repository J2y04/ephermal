import urllib.parse
import httpx
from app.config import settings

META_API_VERSION = "v19.0"
META_BASE = f"https://graph.facebook.com/{META_API_VERSION}"

META_SCOPES = [
    "ads_management",
    "ads_read",
    "business_management",
    "pages_read_engagement",
]


def build_oauth_url(state: str) -> str:
    params = urllib.parse.urlencode({
        "client_id": settings.META_APP_ID,
        "redirect_uri": settings.META_REDIRECT_URI,
        "scope": ",".join(META_SCOPES),
        "state": state,
        "response_type": "code",
    })
    return f"https://www.facebook.com/dialog/oauth?{params}"


async def exchange_code_for_token(code: str) -> dict:
    async with httpx.AsyncClient() as client:
        resp = await client.get(f"{META_BASE}/oauth/access_token", params={
            "client_id": settings.META_APP_ID,
            "client_secret": settings.META_APP_SECRET,
            "redirect_uri": settings.META_REDIRECT_URI,
            "code": code,
        })
        resp.raise_for_status()
        return resp.json()


async def get_long_lived_token(short_token: str) -> str:
    async with httpx.AsyncClient() as client:
        resp = await client.get(f"{META_BASE}/oauth/access_token", params={
            "grant_type": "fb_exchange_token",
            "client_id": settings.META_APP_ID,
            "client_secret": settings.META_APP_SECRET,
            "fb_exchange_token": short_token,
        })
        resp.raise_for_status()
        return resp.json()["access_token"]


async def get_ad_accounts(access_token: str) -> list[dict]:
    async with httpx.AsyncClient() as client:
        resp = await client.get(f"{META_BASE}/me/adaccounts", params={
            "access_token": access_token,
            "fields": "id,name,account_status,currency",
        })
        resp.raise_for_status()
        return resp.json().get("data", [])


async def create_campaign(access_token: str, ad_account_id: str, name: str, objective: str = "OUTCOME_SALES", daily_budget_cents: int = 5000) -> str:
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{META_BASE}/act_{ad_account_id}/campaigns",
            params={"access_token": access_token},
            json={
                "name": name,
                "objective": objective,
                "status": "PAUSED",
                "special_ad_categories": [],
            },
        )
        resp.raise_for_status()
        return resp.json()["id"]


async def create_ad_set(access_token: str, ad_account_id: str, campaign_id: str, name: str, daily_budget_cents: int, targeting: dict | None = None) -> str:
    default_targeting = targeting or {
        "age_min": 18, "age_max": 65,
        "geo_locations": {"countries": ["US", "GB", "CA", "AU"]},
        "publisher_platforms": ["facebook", "instagram"],
        "facebook_positions": ["feed", "reels"],
        "instagram_positions": ["stream", "reels"],
    }
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{META_BASE}/act_{ad_account_id}/adsets",
            params={"access_token": access_token},
            json={
                "name": name,
                "campaign_id": campaign_id,
                "daily_budget": daily_budget_cents,
                "billing_event": "IMPRESSIONS",
                "optimization_goal": "OFFSITE_CONVERSIONS",
                "targeting": default_targeting,
                "status": "PAUSED",
            },
        )
        resp.raise_for_status()
        return resp.json()["id"]


async def upload_ad_image(access_token: str, ad_account_id: str, image_bytes: bytes) -> str:
    import base64
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{META_BASE}/act_{ad_account_id}/adimages",
            params={"access_token": access_token},
            json={"bytes": base64.b64encode(image_bytes).decode()},
        )
        resp.raise_for_status()
        return list(resp.json()["images"].values())[0]["hash"]


async def get_campaign_insights(access_token: str, campaign_id: str) -> dict:
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{META_BASE}/{campaign_id}/insights",
            params={
                "access_token": access_token,
                "fields": "spend,impressions,clicks,actions,action_values,ctr",
                "date_preset": "last_30d",
            },
        )
        resp.raise_for_status()
        data = resp.json().get("data", [])
        return data[0] if data else {}
