import stripe
from app.config import settings

stripe.api_key = settings.STRIPE_SECRET_KEY

PLAN_PRICES = {
    "starter": settings.STRIPE_PRICE_STARTER,
    "growth": settings.STRIPE_PRICE_GROWTH,
    "scale": settings.STRIPE_PRICE_SCALE,
}

CREDIT_PACKS = {
    "100":  {"credits": 100,  "price_cents": 990},
    "500":  {"credits": 500,  "price_cents": 3990},
    "1000": {"credits": 1000, "price_cents": 6990},
}


async def get_or_create_customer(email: str, name: str | None = None) -> str:
    customers = stripe.Customer.list(email=email, limit=1)
    if customers.data:
        return customers.data[0].id
    customer = stripe.Customer.create(email=email, name=name)
    return customer.id


async def create_checkout_session(customer_id: str, price_id: str, success_url: str, cancel_url: str) -> str:
    session = stripe.checkout.Session.create(
        customer=customer_id,
        mode="subscription",
        line_items=[{"price": price_id, "quantity": 1}],
        success_url=success_url,
        cancel_url=cancel_url,
        allow_promotion_codes=True,
    )
    return session.url


async def create_credit_payment(customer_id: str, pack: str, success_url: str, cancel_url: str) -> str:
    if pack not in CREDIT_PACKS:
        raise ValueError(f"Invalid pack: {pack}")
    info = CREDIT_PACKS[pack]
    session = stripe.checkout.Session.create(
        customer=customer_id,
        mode="payment",
        line_items=[{
            "price_data": {
                "currency": "usd",
                "product_data": {"name": f"Ephermal UGC Credits — {pack} pack"},
                "unit_amount": info["price_cents"],
            },
            "quantity": 1,
        }],
        metadata={"type": "credits", "pack": pack, "credits": info["credits"]},
        success_url=success_url,
        cancel_url=cancel_url,
    )
    return session.url


def construct_webhook_event(payload: bytes, sig_header: str) -> stripe.Event:
    return stripe.Webhook.construct_event(payload, sig_header, settings.STRIPE_WEBHOOK_SECRET)


async def cancel_subscription(subscription_id: str) -> None:
    stripe.Subscription.modify(subscription_id, cancel_at_period_end=True)


async def get_subscription(subscription_id: str) -> stripe.Subscription:
    return stripe.Subscription.retrieve(subscription_id)
