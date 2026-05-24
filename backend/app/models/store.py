import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Boolean, DateTime, Text, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class Store(Base):
    __tablename__ = "stores"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    # Shopify
    shopify_domain: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True, index=True)
    shopify_access_token_enc: Mapped[str | None] = mapped_column(Text, nullable=True)  # Fernet-encrypted
    shopify_shop_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    shopify_connected: Mapped[bool] = mapped_column(Boolean, default=False)

    # Meta
    meta_access_token_enc: Mapped[str | None] = mapped_column(Text, nullable=True)
    meta_ad_account_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    meta_pixel_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    meta_connected: Mapped[bool] = mapped_column(Boolean, default=False)

    # Google Ads
    google_refresh_token_enc: Mapped[str | None] = mapped_column(Text, nullable=True)
    google_customer_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    google_connected: Mapped[bool] = mapped_column(Boolean, default=False)

    # Store metadata (cached from Shopify)
    store_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    store_currency: Mapped[str] = mapped_column(String(10), default="USD")
    store_niche: Mapped[str | None] = mapped_column(String(100), nullable=True)
    brand_voice: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="stores")
    campaigns: Mapped[list["Campaign"]] = relationship("Campaign", back_populates="store", cascade="all, delete-orphan")
    creatives: Mapped[list["Creative"]] = relationship("Creative", back_populates="store", cascade="all, delete-orphan")
