import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Text, ForeignKey, JSON, Enum, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base
import enum


class CreativeType(str, enum.Enum):
    video = "video"
    image = "image"


class CreativeStatus(str, enum.Enum):
    generating = "generating"
    pending_review = "pending_review"
    approved = "approved"
    rejected = "rejected"
    launched = "launched"
    failed = "failed"


class Creative(Base):
    __tablename__ = "creatives"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    store_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("stores.id", ondelete="CASCADE"), nullable=False, index=True)
    campaign_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("campaigns.id", ondelete="SET NULL"), nullable=True, index=True)

    type: Mapped[CreativeType] = mapped_column(Enum(CreativeType), default=CreativeType.video)
    status: Mapped[CreativeStatus] = mapped_column(Enum(CreativeStatus), default=CreativeStatus.pending_review, index=True)

    # File storage
    file_path: Mapped[str | None] = mapped_column(Text, nullable=True)      # /var/www/ephermal/media/...
    file_url: Mapped[str | None] = mapped_column(Text, nullable=True)        # Public URL
    thumbnail_url: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Ad copy
    headline: Mapped[str | None] = mapped_column(String(255), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    cta: Mapped[str | None] = mapped_column(String(50), nullable=True)
    destination_url: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Generation metadata
    product_id: Mapped[str | None] = mapped_column(String(100), nullable=True)  # Shopify product ID
    higgsfield_job_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    generation_config: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    # Performance (after launch)
    impressions: Mapped[int] = mapped_column(Integer, default=0)
    clicks: Mapped[int] = mapped_column(Integer, default=0)
    spend: Mapped[float] = mapped_column(default=0.0)
    roas: Mapped[float | None] = mapped_column(nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    store: Mapped["Store"] = relationship("Store", back_populates="creatives")
    campaign: Mapped["Campaign | None"] = relationship("Campaign", back_populates="creatives")
