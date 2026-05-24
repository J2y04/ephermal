from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.models.user import User
from app.models.store import Store
from app.models.creative import Creative, CreativeStatus
from app.schemas.campaign import CreativeOut
from app.routers.deps import get_current_user

router = APIRouter(prefix="/api/creatives", tags=["creatives"])


@router.get("/", response_model=list[CreativeOut])
async def list_creatives(
    store_id: str,
    status: CreativeStatus | None = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Store).where(Store.id == store_id, Store.user_id == user.id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Store not found")

    query = select(Creative).where(Creative.store_id == store_id)
    if status:
        query = query.where(Creative.status == status)
    query = query.order_by(Creative.created_at.desc())

    result = await db.execute(query)
    return result.scalars().all()


@router.post("/{creative_id}/approve", response_model=CreativeOut)
async def approve_creative(
    creative_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Creative).join(Store).where(Creative.id == creative_id, Store.user_id == user.id)
    )
    creative = result.scalar_one_or_none()
    if not creative:
        raise HTTPException(status_code=404, detail="Creative not found")
    if creative.status != CreativeStatus.pending_review:
        raise HTTPException(status_code=400, detail="Creative is not pending review")

    creative.status = CreativeStatus.approved
    return creative


@router.post("/{creative_id}/reject", response_model=CreativeOut)
async def reject_creative(
    creative_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Creative).join(Store).where(Creative.id == creative_id, Store.user_id == user.id)
    )
    creative = result.scalar_one_or_none()
    if not creative:
        raise HTTPException(status_code=404, detail="Creative not found")

    creative.status = CreativeStatus.rejected
    return creative


@router.delete("/{creative_id}", status_code=204)
async def delete_creative(
    creative_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Creative).join(Store).where(Creative.id == creative_id, Store.user_id == user.id)
    )
    creative = result.scalar_one_or_none()
    if not creative:
        raise HTTPException(status_code=404, detail="Creative not found")
    await db.delete(creative)
