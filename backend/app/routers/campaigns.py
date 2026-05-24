from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.database import get_db
from app.models.user import User
from app.models.store import Store
from app.models.campaign import Campaign, CampaignStatus
from app.models.billing import Subscription, CreditTransaction, SubStatus
from app.schemas.campaign import CampaignCreate, CampaignOut
from app.routers.deps import get_current_user
from app.services import agents
import uuid

MINIMUM_CREDITS_TO_LAUNCH = 10

router = APIRouter(prefix="/api/campaigns", tags=["campaigns"])


async def _get_user_store(user: User, store_id: str, db: AsyncSession) -> Store:
    result = await db.execute(select(Store).where(Store.id == store_id, Store.user_id == user.id, Store.is_active == True))
    store = result.scalar_one_or_none()
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    return store


@router.get("/", response_model=list[CampaignOut])
async def list_campaigns(
    store_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_user_store(user, store_id, db)
    result = await db.execute(select(Campaign).where(Campaign.store_id == store_id).order_by(Campaign.created_at.desc()))
    return result.scalars().all()


@router.post("/", response_model=CampaignOut, status_code=201)
async def create_campaign(
    store_id: str,
    body: CampaignCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    store = await _get_user_store(user, store_id, db)

    campaign = Campaign(
        store_id=store.id,
        name=body.name,
        platform=body.platform,
        daily_budget=body.daily_budget,
        products=body.products,
        config=body.config,
        status=CampaignStatus.draft,
    )
    db.add(campaign)
    await db.flush()
    return campaign


@router.post("/{campaign_id}/launch", response_model=CampaignOut)
async def launch_campaign(
    campaign_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Campaign).join(Store).where(Campaign.id == campaign_id, Store.user_id == user.id)
    )
    campaign = result.scalar_one_or_none()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    if campaign.status not in (CampaignStatus.draft, CampaignStatus.paused):
        raise HTTPException(status_code=400, detail=f"Cannot launch campaign in status: {campaign.status}")

    # Subscription check
    sub_result = await db.execute(
        select(Subscription).where(
            Subscription.user_id == user.id,
            Subscription.status.in_([SubStatus.active, SubStatus.trialing])
        )
    )
    if not sub_result.scalar_one_or_none():
        raise HTTPException(
            status_code=403,
            detail="An active subscription is required to launch campaigns. Please subscribe at /billing."
        )

    # Credit balance check
    balance_result = await db.execute(
        select(func.coalesce(func.sum(CreditTransaction.amount), 0)).where(CreditTransaction.user_id == user.id)
    )
    balance = balance_result.scalar() or 0
    if balance < MINIMUM_CREDITS_TO_LAUNCH:
        raise HTTPException(
            status_code=402,
            detail=f"Insufficient UGC credits. You need at least {MINIMUM_CREDITS_TO_LAUNCH} credits to launch a campaign. Your balance: {balance}. Purchase more credits in the billing section."
        )

    campaign.status = CampaignStatus.pending
    await db.flush()

    # Fire n8n orchestrator to generate UGC + launch ads
    try:
        await agents.trigger_ugc_pipeline(
            store_id=str(campaign.store_id),
            product_ids=campaign.products or [],
            campaign_id=str(campaign.id),
        )
    except Exception:
        # Non-fatal: n8n may be offline during dev; campaign stays pending
        pass

    return campaign


@router.post("/{campaign_id}/pause", response_model=CampaignOut)
async def pause_campaign(
    campaign_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Campaign).join(Store).where(Campaign.id == campaign_id, Store.user_id == user.id)
    )
    campaign = result.scalar_one_or_none()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    campaign.status = CampaignStatus.paused
    return campaign


@router.delete("/{campaign_id}", status_code=204)
async def delete_campaign(
    campaign_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Campaign).join(Store).where(Campaign.id == campaign_id, Store.user_id == user.id)
    )
    campaign = result.scalar_one_or_none()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    await db.delete(campaign)
