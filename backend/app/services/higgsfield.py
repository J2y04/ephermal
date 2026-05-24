import httpx
from app.config import settings

HIGGSFIELD_BASE = "https://api.higgsfield.ai/v1"

CREDIT_COST_VIDEO = 10   # credits per video generation
CREDIT_COST_IMAGE = 2    # credits per image generation


async def generate_ugc_video(
    product_name: str,
    product_description: str,
    product_image_url: str,
    style: str = "authentic_review",
    aspect_ratio: str = "9:16",
) -> dict:
    """Trigger a UGC video generation. Returns job_id and estimated seconds."""
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{HIGGSFIELD_BASE}/generations",
            headers={"Authorization": f"Bearer {settings.HIGGSFIELD_API_KEY}"},
            json={
                "type": "ugc_video",
                "product": {
                    "name": product_name,
                    "description": product_description,
                    "image_url": product_image_url,
                },
                "style": style,
                "aspect_ratio": aspect_ratio,
                "duration": 15,
            },
        )
        resp.raise_for_status()
        return resp.json()


async def generate_product_image(
    product_name: str,
    product_image_url: str,
    ad_copy: str,
    format: str = "1080x1080",
) -> dict:
    """Generate a static product ad image."""
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{HIGGSFIELD_BASE}/generations",
            headers={"Authorization": f"Bearer {settings.HIGGSFIELD_API_KEY}"},
            json={
                "type": "product_image",
                "product_image_url": product_image_url,
                "ad_copy": ad_copy,
                "format": format,
            },
        )
        resp.raise_for_status()
        return resp.json()


async def get_job_status(job_id: str) -> dict:
    """Poll generation job status. Returns status + output_url when done."""
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            f"{HIGGSFIELD_BASE}/generations/{job_id}",
            headers={"Authorization": f"Bearer {settings.HIGGSFIELD_API_KEY}"},
        )
        resp.raise_for_status()
        return resp.json()


async def download_output(url: str) -> bytes:
    async with httpx.AsyncClient(timeout=120, follow_redirects=True) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        return resp.content
