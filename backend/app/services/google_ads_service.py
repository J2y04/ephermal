import urllib.parse
import httpx
from app.config import settings

GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"

ADS_SCOPES = [
    "https://www.googleapis.com/auth/adwords",
    "https://www.googleapis.com/auth/userinfo.email",
]


def build_oauth_url(state: str) -> str:
    params = urllib.parse.urlencode({
        "client_id": settings.GOOGLE_ADS_CLIENT_ID,
        "redirect_uri": settings.GOOGLE_ADS_REDIRECT_URI,
        "response_type": "code",
        "scope": " ".join(ADS_SCOPES),
        "access_type": "offline",
        "prompt": "consent",
        "state": state,
    })
    return f"{GOOGLE_AUTH_URL}?{params}"


async def exchange_code_for_tokens(code: str) -> dict:
    async with httpx.AsyncClient() as client:
        resp = await client.post(GOOGLE_TOKEN_URL, data={
            "code": code,
            "client_id": settings.GOOGLE_ADS_CLIENT_ID,
            "client_secret": settings.GOOGLE_ADS_CLIENT_SECRET,
            "redirect_uri": settings.GOOGLE_ADS_REDIRECT_URI,
            "grant_type": "authorization_code",
        })
        resp.raise_for_status()
        return resp.json()


async def refresh_access_token(refresh_token: str) -> str:
    async with httpx.AsyncClient() as client:
        resp = await client.post(GOOGLE_TOKEN_URL, data={
            "refresh_token": refresh_token,
            "client_id": settings.GOOGLE_ADS_CLIENT_ID,
            "client_secret": settings.GOOGLE_ADS_CLIENT_SECRET,
            "grant_type": "refresh_token",
        })
        resp.raise_for_status()
        return resp.json()["access_token"]


async def list_accessible_customers(access_token: str) -> list[dict]:
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            "https://googleads.googleapis.com/v16/customers:listAccessibleCustomers",
            headers={
                "Authorization": f"Bearer {access_token}",
                "developer-token": settings.GOOGLE_ADS_DEVELOPER_TOKEN,
            },
        )
        resp.raise_for_status()
        return resp.json().get("resourceNames", [])


async def create_pmax_campaign(
    access_token: str,
    customer_id: str,
    name: str,
    daily_budget_micros: int,
    final_url: str,
    headlines: list[str],
    descriptions: list[str],
) -> str:
    """Create a Performance Max campaign via Google Ads API."""
    customer_id_clean = customer_id.replace("-", "")
    url = f"https://googleads.googleapis.com/v16/customers/{customer_id_clean}/googleAds:mutate"
    operations = [
        {
            "campaignBudgetOperation": {
                "create": {
                    "amountMicros": str(daily_budget_micros),
                    "deliveryMethod": "STANDARD",
                }
            }
        },
        {
            "campaignOperation": {
                "create": {
                    "name": name,
                    "advertisingChannelType": "PERFORMANCE_MAX",
                    "status": "PAUSED",
                    "biddingStrategyType": "MAXIMIZE_CONVERSION_VALUE",
                }
            }
        },
    ]
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            url,
            headers={
                "Authorization": f"Bearer {access_token}",
                "developer-token": settings.GOOGLE_ADS_DEVELOPER_TOKEN,
                "login-customer-id": customer_id_clean,
            },
            json={"mutateOperations": operations},
        )
        resp.raise_for_status()
        results = resp.json().get("mutateOperationResponses", [])
        for r in results:
            if "campaignResult" in r:
                return r["campaignResult"]["resourceName"].split("/")[-1]
    return ""
