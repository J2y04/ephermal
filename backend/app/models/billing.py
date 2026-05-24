import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Integer, DateTime, Text, ForeignKey, Enum, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base
import enum


class PlanTier(str, enum.Enum):
    starter = "starter"
    growth = "growth"
    scale = "scale"


class SubStatus(str, enum.Enum):
    active = "active"
    past_due = "past_due"
    canceled = "canceled"
    trialing = "trialing"


class Subscription(Base):
    __tablename__ = "subscriptions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True)

    stripe_customer_id: Mapped[str | None] = mapped_column(String(100), unique=True, nullable=True)
    stripe_subscription_id: Mapped[str | None] = mapped_column(String(100), unique=True, nullable=True)

    plan: Mapped[PlanTier] = mapped_column(Enum(PlanTier), default=PlanTier.starter)
    status: Mapped[SubStatus] = mapped_column(Enum(SubStatus), default=SubStatus.trialing)

    current_period_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    current_period_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cancel_at_period_end: Mapped[bool] = mapped_column(Boolean, default=False)

    # Shopify Billing (alternative to Stripe for app store merchants)
    shopify_charge_id: Mapped[str | None] = mapped_column(String(100), unique=True, nullable=True)
    billing_provider: Mapped[str] = mapped_column(String(20), default="stripe")

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    user: Mapped["User"] = relationship("User", back_populates="subscription")


class CreditTransaction(Base):
    __tablename__ = "credit_transactions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    amount: Mapped[int] = mapped_column(Integer, nullable=False)  # positive = credit, negative = debit
    description: Mapped[str] = mapped_column(String(255), nullable=False)
    reference: Mapped[str | None] = mapped_column(String(255), nullable=True)  # Stripe payment intent or creative ID
    stripe_payment_intent_id: Mapped[str | None] = mapped_column(String(100), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    user: Mapped["User"] = relationship("User", back_populates="credit_transactions")
