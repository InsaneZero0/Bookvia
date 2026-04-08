"""
Stripe configuration and shared helpers.
"""
import os
import logging
import stripe as stripe_lib

from core.database import db
from models.enums import SUBSCRIPTION_PRICE_MXN, SUBSCRIPTION_TRIAL_DAYS

logger = logging.getLogger(__name__)

STRIPE_API_KEY = os.environ.get('STRIPE_API_KEY', 'sk_test_emergent')
stripe_lib.api_key = STRIPE_API_KEY
if "sk_test_emergent" in STRIPE_API_KEY:
    stripe_lib.api_base = "https://integrations.emergentagent.com/stripe"


async def get_or_create_stripe_price():
    config = await db.stripe_config.find_one({"type": "subscription_price"})
    if config and config.get("price_id"):
        return config["price_id"]
    try:
        product = stripe_lib.Product.create(
            name="Bookvia Suscripción Mensual",
            description="Suscripción mensual a la plataforma Bookvia"
        )
        price = stripe_lib.Price.create(
            product=product.id,
            unit_amount=int(SUBSCRIPTION_PRICE_MXN * 100),
            currency="mxn",
            recurring={"interval": "month"}
        )
        await db.stripe_config.update_one(
            {"type": "subscription_price"},
            {"$set": {"price_id": price.id, "product_id": product.id}},
            upsert=True
        )
        return price.id
    except Exception as e:
        logger.error(f"Failed to create Stripe price: {e}")
        return None
