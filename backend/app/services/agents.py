"""
Orchestrator service — fires the n8n AI Agent node to kick off
the ad generation pipeline for a store.
"""
import httpx
from app.config import settings


async def trigger_orchestrator(payload: dict) -> dict:
    """POST to n8n orchestrator webhook and return its response."""
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            settings.N8N_ORCHESTRATOR_WEBHOOK,
            headers={"X-Api-Key": settings.N8N_API_KEY},
            json=payload,
        )
        resp.raise_for_status()
        return resp.json()


async def trigger_ugc_pipeline(store_id: str, product_ids: list[str], campaign_id: str) -> dict:
    """Kick off the full UGC → ad creation pipeline for a set of products."""
    return await trigger_orchestrator({
        "event": "generate_ugc_ads",
        "store_id": store_id,
        "product_ids": product_ids,
        "campaign_id": campaign_id,
    })


async def trigger_campaign_optimization(store_id: str, campaign_ids: list[str]) -> dict:
    """Ask the optimizer agent to review and rebalance campaigns."""
    return await trigger_orchestrator({
        "event": "optimize_campaigns",
        "store_id": store_id,
        "campaign_ids": campaign_ids,
    })


async def trigger_analytics_sync(store_id: str) -> dict:
    """Pull fresh analytics from Meta/Google and update DB."""
    return await trigger_orchestrator({
        "event": "sync_analytics",
        "store_id": store_id,
    })


async def trigger_copy_generation(
    store_id: str,
    product_name: str,
    product_description: str,
    brand_voice: dict | None = None,
    count: int = 5,
) -> dict:
    """Generate ad copy variants for a product."""
    return await trigger_orchestrator({
        "event": "generate_copy",
        "store_id": store_id,
        "product_name": product_name,
        "product_description": product_description,
        "brand_voice": brand_voice or {},
        "count": count,
    })
