import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Float, DateTime, Text, ForeignKey, JSON, Enum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base
import enum


class CampaignStatus(str, enum.Enum):
    draft = "draft"
    pending = "pending"
    live = "live"
    paused = "paused"
    completed = "completed"
    failed = "failed"


class CampaignPlatform(str, enum.Enum):
    meta = "meta"
    google = "google"
    both = "both"


class Campaign(Base):
    __tablename__ = "campaigns"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    store_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("stores.id", ondelete="CASCADE"), nullable=False, index=True)

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    platform: Mapped[CampaignPlatform] = mapped_column(Enum(CampaignPlatform), default=CampaignPlatform.meta)
    status: Mapped[CampaignStatus] = mapped_column(Enum(CampaignStatus), default=CampaignStatus.draft, index=True)

    # External IDs (from Meta/Google)
    meta_campaign_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    google_campaign_id: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Budget
    daily_budget: Mapped[float | None] = mapped_column(Float, nullable=True)
    total_spend: Mapped[float] = mapped_column(Float, default=0.0)

    # Performance
    roas: Mapped[float | None] = mapped_column(Float, nullable=True)
    impressions: Mapped[int] = mapped_column(default=0)
    clicks: Mapped[int] = mapped_column(default=0)
    conversions: Mapped[int] = mapped_column(default=0)
    ctr: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Campaign config (targeting, objective, etc.)
    config: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    products: Mapped[list | None] = mapped_column(JSON, nullable=True)  # Shopify product IDs

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    launched_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Relationships
    store: Mapped["Store"] = relationship("Store", back_populates="campaigns")
    creatives: Mapped[list["Creative"]] = relationship("Creative", back_populates="campaign")
