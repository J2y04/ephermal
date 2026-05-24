from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.database import get_db
from app.models.user import User
from app.models.store import Store
from app.models.campaign import Campaign, CampaignStatus
from app.models.creative import Creative
from app.routers.deps import get_current_user
from app.services import agents

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


@router.get("/overview")
async def overview(
    store_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Store).where(Store.id == store_id, Store.user_id == user.id))
    store = result.scalar_one_or_none()
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")

    campaigns_result = await db.execute(select(Campaign).where(Campaign.store_id == store_id))
    campaigns = campaigns_result.scalars().all()

    live = [c for c in campaigns if c.status == CampaignStatus.live]
    total_spend = sum(c.total_spend for c in campaigns)
    avg_roas = sum(c.roas for c in live if c.roas) / len(live) if live else 0.0
    total_impressions = sum(c.impressions for c in campaigns)
    total_clicks = sum(c.clicks for c in campaigns)
    total_conversions = sum(c.conversions for c in campaigns)

    creatives_result = await db.execute(
        select(func.count(Creative.id)).where(Creative.store_id == store_id)
    )
    total_creatives = creatives_result.scalar()

    return {
        "roas": round(avg_roas, 2),
        "total_spend": round(total_spend, 2),
        "total_impressions": total_impressions,
        "total_clicks": total_clicks,
        "total_conversions": total_conversions,
        "live_campaigns": len(live),
        "total_campaigns": len(campaigns),
        "total_creatives": total_creatives,
        "currency": store.store_currency,
    }


@router.post("/sync")
async def sync_analytics(
    store_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Store).where(Store.id == store_id, Store.user_id == user.id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Store not found")

    try:
        await agents.trigger_analytics_sync(store_id)
    except Exception:
        raise HTTPException(status_code=503, detail="Orchestrator unavailable")

    return {"ok": True, "message": "Sync triggered"}
