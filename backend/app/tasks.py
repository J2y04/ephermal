"""
Celery tasks. Each task uses a synchronous DB session (psycopg2) since
Celery workers are not async.
"""
import os
import httpx
from celery import shared_task
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from app.config import settings
from app.models.creative import Creative, CreativeStatus, CreativeType
from app.models.store import Store
from app.models.campaign import Campaign, CampaignStatus
from app.models.billing import CreditTransaction
from app.services.higgsfield import get_job_status, download_output, CREDIT_COST_VIDEO, CREDIT_COST_IMAGE
from app.services.agents import trigger_analytics_sync, trigger_campaign_optimization

_engine = create_engine(settings.DATABASE_URL_SYNC)


def _db() -> Session:
    return Session(_engine)


@shared_task(name="app.tasks.poll_pending_generations", bind=True, max_retries=3)
def poll_pending_generations(self):
    """Check all in-progress Higgsfield jobs and save completed files."""
    with _db() as db:
        creatives = db.execute(
            select(Creative).where(Creative.status == CreativeStatus.generating, Creative.higgsfield_job_id.isnot(None))
        ).scalars().all()

        for creative in creatives:
            try:
                import asyncio
                status_data = asyncio.run(get_job_status(creative.higgsfield_job_id))
                job_status = status_data.get("status")

                if job_status == "completed":
                    output_url = status_data.get("output_url")
                    file_bytes = asyncio.run(download_output(output_url))

                    ext = "mp4" if creative.type.value == "video" else "jpg"
                    filename = f"{creative.id}.{ext}"
                    media_path = os.path.join(settings.MEDIA_DIR, filename)
                    os.makedirs(settings.MEDIA_DIR, exist_ok=True)

                    with open(media_path, "wb") as f:
                        f.write(file_bytes)

                    creative.file_path = media_path
                    creative.file_url = f"{settings.APP_URL}/media/{filename}"
                    creative.status = CreativeStatus.pending_review

                    # Deduct credits from the store owner
                    store = db.get(Store, creative.store_id)
                    if store:
                        cost = CREDIT_COST_VIDEO if creative.type == CreativeType.video else CREDIT_COST_IMAGE
                        txn = CreditTransaction(
                            user_id=store.user_id,
                            amount=-cost,
                            description=f"UGC {'video' if creative.type == CreativeType.video else 'image'} generated",
                            reference=str(creative.id),
                        )
                        db.add(txn)

                elif job_status == "failed":
                    creative.status = CreativeStatus.failed

                db.commit()
            except Exception as e:
                db.rollback()


@shared_task(name="app.tasks.sync_all_analytics")
def sync_all_analytics():
    """Trigger analytics sync for all active stores."""
    with _db() as db:
        stores = db.execute(select(Store).where(Store.is_active == True)).scalars().all()
        for store in stores:
            try:
                import asyncio
                asyncio.run(trigger_analytics_sync(str(store.id)))
            except Exception:
                pass


@shared_task(name="app.tasks.optimize_all_campaigns")
def optimize_all_campaigns():
    """Daily: ask the optimizer agent to review underperforming campaigns."""
    with _db() as db:
        stores = db.execute(select(Store).where(Store.is_active == True)).scalars().all()
        for store in stores:
            campaign_ids = [
                str(c.id) for c in db.execute(
                    select(Campaign).where(Campaign.store_id == store.id, Campaign.status == CampaignStatus.live)
                ).scalars().all()
            ]
            if campaign_ids:
                try:
                    import asyncio
                    asyncio.run(trigger_campaign_optimization(str(store.id), campaign_ids))
                except Exception:
                    pass
