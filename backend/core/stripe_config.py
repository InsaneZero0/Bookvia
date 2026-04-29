"""
Stripe configuration and shared helpers.
"""
import os
import logging
import stripe as stripe_lib

from core.database import db
from models.enums import SUBSCRIPTION_PRICE_MXN, SUBSCRIPTION_PRICE_USD, SUBSCRIPTION_TRIAL_DAYS

logger = logging.getLogger(__name__)

STRIPE_API_KEY = os.environ.get('STRIPE_API_KEY', 'sk_test_emergent')
stripe_lib.api_key = STRIPE_API_KEY
if "sk_test_emergent" in STRIPE_API_KEY:
    stripe_lib.api_base = "https://integrations.emergentagent.com/stripe"


async def get_or_create_stripe_price(country_code: str = "MX"):
    """
    Returns the Stripe price ID for the subscription, creating one if needed.
    Validates the cached price_id still exists in Stripe; recreates if missing.
    Pricing depends on country:
      - MX: $49.99 MXN
      - US (or any non-MX): $4.99 USD
    """
    is_usd = (country_code or "MX").upper() != "MX"
    config_key = "subscription_price_usd" if is_usd else "subscription_price_mxn"
    
    config = await db.stripe_config.find_one({"type": config_key})
    if config and config.get("price_id"):
        # Validate the cached price still exists in Stripe (handles key rotation/test wipes)
        try:
            stripe_lib.Price.retrieve(config["price_id"])
            return config["price_id"]
        except Exception as e:
            logger.warning(f"Cached Stripe price {config['price_id']} invalid, recreating: {e}")
            # fall through to recreate
    
    try:
        product_name = "Bookvia Subscription (USD)" if is_usd else "Bookvia Suscripción Mensual"
        product_desc = "Monthly subscription to Bookvia platform" if is_usd else "Suscripción mensual a la plataforma Bookvia"
        product = stripe_lib.Product.create(name=product_name, description=product_desc)
        
        if is_usd:
            unit_amount = int(SUBSCRIPTION_PRICE_USD * 100)
            currency = "usd"
        else:
            unit_amount = int(SUBSCRIPTION_PRICE_MXN * 100)
            currency = "mxn"
        
        price = stripe_lib.Price.create(
            product=product.id,
            unit_amount=unit_amount,
            currency=currency,
            recurring={"interval": "month"}
        )
        await db.stripe_config.update_one(
            {"type": config_key},
            {"$set": {"price_id": price.id, "product_id": product.id, "currency": currency, "amount": unit_amount}},
            upsert=True
        )
        return price.id
    except Exception as e:
        logger.error(f"Failed to create Stripe price ({config_key}): {e}")
        return None
