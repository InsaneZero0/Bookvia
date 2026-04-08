"""
Bookvia API - Main Application Entry Point
All endpoint logic has been extracted to /routers/*.py
"""
from fastapi import FastAPI, APIRouter
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import RedirectResponse
import asyncio
import os
import logging
from pathlib import Path
from datetime import datetime, timezone, timedelta

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Create the main app
app = FastAPI(title="Bookvia API", version="2.0.0")

# Create the main API router
api_router = APIRouter(prefix="/api")

# ========================== IMPORT AND INCLUDE ROUTERS ==========================

from routers.auth import router as auth_router
from routers.users import router as users_router
from routers.businesses import router as businesses_router
from routers.services import router as services_router
from routers.bookings import router as bookings_router
from routers.reviews import router as reviews_router
from routers.categories import router as categories_router
from routers.payments import router as payments_router
from routers.admin import router as admin_router
from routers.notifications import router as notifications_router
from routers.finance import router as finance_router
from routers.system import router as system_router
from routers.seo import seo_router

api_router.include_router(auth_router)
api_router.include_router(users_router)
api_router.include_router(businesses_router)
api_router.include_router(services_router)
api_router.include_router(bookings_router)
api_router.include_router(reviews_router)
api_router.include_router(categories_router)
api_router.include_router(payments_router)
api_router.include_router(admin_router)
api_router.include_router(notifications_router)
api_router.include_router(finance_router)
api_router.include_router(system_router)

# SEO routes at root level (no /api prefix for sitemap/robots)
app.include_router(seo_router)

# Include the main API router
app.include_router(api_router)

# ========================== MIDDLEWARE ==========================

from middleware.rate_limit import RateLimitMiddleware
app.add_middleware(RateLimitMiddleware)


class HTTPSRedirectMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        if response.status_code in (307, 308, 301, 302):
            location = response.headers.get('location', '')
            x_forwarded_proto = request.headers.get('x-forwarded-proto', 'http')
            if x_forwarded_proto == 'https' and location.startswith('http://'):
                new_location = location.replace('http://', 'https://', 1)
                return RedirectResponse(url=new_location, status_code=response.status_code)
        return response


app.add_middleware(HTTPSRedirectMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# ========================== LIFECYCLE EVENTS ==========================

from core.database import client, db


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()


@app.on_event("startup")
async def startup_event():
    try:
        from services.storage import init_storage
        init_storage()
        logger.info("Object storage initialized")
    except Exception as e:
        logger.warning(f"Object storage init failed (uploads will retry): {e}")
    try:
        from services.cloudinary_service import init_cloudinary
        if init_cloudinary():
            logger.info("Cloudinary initialized")
        else:
            logger.warning("Cloudinary not configured - using fallback storage")
    except Exception as e:
        logger.warning(f"Cloudinary init failed: {e}")
    # Start background schedulers
    asyncio.create_task(appointment_reminder_scheduler())
    asyncio.create_task(subscription_reminder_scheduler())


# ========================== BACKGROUND SCHEDULERS ==========================

async def appointment_reminder_scheduler():
    """Send appointment reminders 24h before."""
    logger.info("Appointment reminder scheduler started")
    await asyncio.sleep(60)
    while True:
        try:
            await send_appointment_reminders()
        except Exception as e:
            logger.error(f"Appointment reminder error: {e}")
        await asyncio.sleep(1800)  # 30 min


async def send_appointment_reminders():
    import pytz
    now = datetime.now(timezone.utc)
    tomorrow_start = now + timedelta(hours=23)
    tomorrow_end = now + timedelta(hours=25)

    bookings = await db.bookings.find({
        "status": "confirmed",
        "reminder_sent": {"$ne": True}
    }, {"_id": 0}).to_list(500)

    for booking in bookings:
        try:
            business = await db.businesses.find_one({"id": booking["business_id"]}, {"_id": 0, "name": 1, "timezone": 1, "address": 1})
            if not business:
                continue

            biz_tz = pytz.timezone(business.get("timezone", "America/Mexico_City"))
            date_str = booking["date"]
            time_str = booking["time"]

            from datetime import datetime as dt
            naive = dt.strptime(f"{date_str} {time_str}", "%Y-%m-%d %H:%M")
            local_dt = biz_tz.localize(naive)
            utc_dt = local_dt.astimezone(pytz.utc)

            time_until = (utc_dt - now).total_seconds() / 3600

            if 0 < time_until <= 25:
                user = await db.users.find_one({"id": booking["user_id"]}, {"_id": 0, "email": 1, "full_name": 1})
                if not user:
                    continue
                service = await db.services.find_one({"id": booking["service_id"]}, {"_id": 0, "name": 1})

                try:
                    from services.email import send_appointment_reminder
                    await send_appointment_reminder(
                        user_email=user["email"],
                        user_name=user.get("full_name", ""),
                        business_name=business.get("name", ""),
                        service_name=service.get("name", "") if service else "",
                        appointment_date=date_str,
                        appointment_time=time_str,
                        business_address=business.get("address", "")
                    )
                    await db.bookings.update_one(
                        {"id": booking["id"]},
                        {"$set": {"reminder_sent": True}}
                    )
                    logger.info(f"Reminder sent for booking {booking['id']} to {user['email']}")
                except Exception as e:
                    logger.error(f"Failed to send reminder for booking {booking.get('id')}: {e}")
        except Exception as e:
            logger.error(f"Failed to send reminder for booking {booking.get('id')}: {e}")


async def subscription_reminder_scheduler():
    """Remind businesses that haven't paid their subscription."""
    logger.info("Subscription reminder scheduler started")
    await asyncio.sleep(300)
    while True:
        try:
            await send_subscription_reminders()
        except Exception as e:
            logger.error(f"Subscription reminder scheduler error: {e}")
        await asyncio.sleep(21600)  # 6 hours


async def send_subscription_reminders():
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    businesses = await db.businesses.find({
        "subscription_status": "none",
        "created_at": {"$lt": cutoff},
        "subscription_reminder_sent": {"$ne": True}
    }, {"_id": 0, "id": 1, "email": 1, "name": 1}).to_list(50)

    if not businesses:
        return

    base_url = os.environ.get("BASE_URL", "")
    login_url = f"{base_url}/login"

    logger.info(f"Sending {len(businesses)} subscription reminders")

    for biz in businesses:
        try:
            from services.email import send_subscription_reminder
            await send_subscription_reminder(
                business_email=biz["email"],
                business_name=biz.get("name", ""),
                login_url=login_url
            )
            await db.businesses.update_one(
                {"id": biz["id"]},
                {"$set": {"subscription_reminder_sent": True}}
            )
            logger.info(f"Subscription reminder sent to {biz['email']}")
        except Exception as e:
            logger.error(f"Failed to send subscription reminder to {biz.get('email')}: {e}")
