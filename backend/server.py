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

# Sentry — error monitoring and performance tracing (must be initialized
# BEFORE the FastAPI app is created so middlewares are wired correctly).
_SENTRY_DSN = os.environ.get("SENTRY_DSN", "").strip()
if _SENTRY_DSN:
    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration
        from sentry_sdk.integrations.starlette import StarletteIntegration

        sentry_sdk.init(
            dsn=_SENTRY_DSN,
            environment=os.environ.get("SENTRY_ENVIRONMENT", "development"),
            traces_sample_rate=float(os.environ.get("SENTRY_TRACES_SAMPLE_RATE", "0.1")),
            send_default_pii=False,  # never send raw card/PII data
            integrations=[FastApiIntegration(), StarletteIntegration()],
        )
        logger.info("Sentry initialized for environment=%s",
                    os.environ.get("SENTRY_ENVIRONMENT", "development"))
    except Exception as _sentry_err:
        logger.warning("Sentry init failed (continuing without): %s", _sentry_err)

# Create the main app
app = FastAPI(title="Bookvia API", version="2.0.0")

# Create the main API router
api_router = APIRouter(prefix="/api")

# ========================== IMPORT AND INCLUDE ROUTERS ==========================

from routers.auth import router as auth_router
from routers.users import router as users_router
from routers.businesses import router as businesses_router
from routers.branches import router as branches_router
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
from routers.terms import router as terms_router  # Fase 10
from routers.waitlist import router as waitlist_router, admin_router as waitlist_admin_router  # Fase 16
from routers.stripe_connect import router as stripe_connect_router  # Fase 22 - Connect Express
from routers.winback import admin_router as winback_admin_router, public_router as winback_public_router  # Fase G - Winback + LFPDPPP

api_router.include_router(auth_router)
api_router.include_router(users_router)
api_router.include_router(businesses_router)
api_router.include_router(branches_router)
api_router.include_router(services_router)
api_router.include_router(bookings_router)
api_router.include_router(reviews_router)
api_router.include_router(categories_router)
api_router.include_router(payments_router)
api_router.include_router(admin_router)
api_router.include_router(notifications_router)
api_router.include_router(finance_router)
api_router.include_router(system_router)
api_router.include_router(terms_router)
api_router.include_router(waitlist_router)
api_router.include_router(waitlist_admin_router)
api_router.include_router(stripe_connect_router)
api_router.include_router(winback_admin_router)
api_router.include_router(winback_public_router)

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

# Fase 12a: security headers (HSTS, X-Content-Type-Options, etc.)
from core.security_hardening import limiter, security_headers_middleware  # noqa: E402
from slowapi.errors import RateLimitExceeded  # noqa: E402
from slowapi import _rate_limit_exceeded_handler  # noqa: E402

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.middleware("http")(security_headers_middleware)

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
    # Ensure unique sparse index on businesses.public_code + backfill missing codes
    try:
        from core.database import db
        from services.public_code import generate_unique_public_code, generate_unique_user_code
        await db.businesses.create_index("public_code", unique=True, sparse=True)
        await db.users.create_index("public_code", unique=True, sparse=True)
        # Backfill businesses
        missing_biz = await db.businesses.find(
            {"$or": [{"public_code": {"$exists": False}}, {"public_code": None}, {"public_code": ""}]},
            {"_id": 0, "id": 1}
        ).to_list(1000)
        for b in missing_biz:
            code = await generate_unique_public_code(db)
            await db.businesses.update_one({"id": b["id"]}, {"$set": {"public_code": code}})
        if missing_biz:
            logger.info(f"Backfilled BV public_code for {len(missing_biz)} businesses")
    except Exception as e:
        logger.warning(f"Public code backfill failed: {e}")

    # Migrate legacy settlement period_key format: YYYY-MM-D20 -> YYYY-MM-20
    # The frontend always uses YYYY-MM-DD format; old docs with `-D20` were
    # invisible to the UI. Idempotent: only matches the legacy pattern.
    try:
        from core.database import db
        import re
        legacy_cursor = db.settlements.find({"period_key": {"$regex": "^[0-9]{4}-[0-9]{2}-D20$"}}, {"_id": 0, "id": 1, "period_key": 1})
        migrated = 0
        async for s in legacy_cursor:
            new_key = re.sub(r"-D20$", "-20", s["period_key"])
            await db.settlements.update_one({"id": s["id"]}, {"$set": {"period_key": new_key}})
            migrated += 1
        if migrated:
            logger.info(f"Migrated {migrated} settlements from legacy -D20 period_key to YYYY-MM-DD")
        # Also migrate the period field in transactions if it exists
        await db.transactions.update_many(
            {"settlement_period": {"$regex": "^[0-9]{4}-[0-9]{2}-D20$"}},
            [{"$set": {"settlement_period": {"$replaceOne": {"input": "$settlement_period", "find": "-D20", "replacement": "-20"}}}}],
        )
    except Exception as e:
        logger.warning(f"Settlement period_key migration failed: {e}")

    try:
        from core.database import db
        from services.public_code import generate_unique_user_code
        # Backfill users (any role except admin)
        missing_users = await db.users.find(
            {"role": {"$ne": "admin"},
             "$or": [{"public_code": {"$exists": False}}, {"public_code": None}, {"public_code": ""}]},
            {"_id": 0, "id": 1}
        ).to_list(5000)
        for u in missing_users:
            code = await generate_unique_user_code(db)
            await db.users.update_one({"id": u["id"]}, {"$set": {"public_code": code}})
        if missing_users:
            logger.info(f"Backfilled CL public_code for {len(missing_users)} users")
    except Exception as e:
        logger.warning(f"public_code backfill failed: {e}")

    # ------------------------------------------------------------------
    # Performance indexes for high-traffic collections.
    # Each index runs in its own try so a single conflict (e.g. duplicate
    # data) does not abort the rest. MongoDB createIndex is idempotent.
    # ------------------------------------------------------------------
    from core.database import db as _db_idx
    _index_specs = [
        # users: login by email is the single most frequent query.
        # Note: non-unique on purpose (existing data may have dups that
        # need manual dedupe before flipping to unique).
        ("users", [("email", 1)], {"sparse": True}),
        ("users", [("stripe_customer_id", 1)], {"sparse": True}),
        ("users", [("business_id", 1)], {"sparse": True}),
        # businesses: public search + ownership lookups
        ("businesses", [("status", 1), ("country_code", 1), ("city", 1)], {}),
        ("businesses", [("user_id", 1)], {}),
        ("businesses", [("slug", 1)], {"sparse": True}),
        ("businesses", [("stripe_connect_account_id", 1)], {"sparse": True}),
        # branches
        ("branches", [("business_id", 1), ("is_active", 1)], {}),
        ("branches", [("business_id", 1), ("is_primary", 1)], {}),
        # services
        ("services", [("business_id", 1), ("is_active", 1)], {}),
        ("services", [("business_id", 1), ("branch_id", 1)], {}),
        # bookings
        ("bookings", [("business_id", 1), ("date", 1)], {}),
        ("bookings", [("business_id", 1), ("status", 1)], {}),
        ("bookings", [("user_id", 1), ("date", -1)], {}),
        ("bookings", [("worker_id", 1), ("date", 1)], {}),
        ("bookings", [("branch_id", 1), ("date", 1)], {"sparse": True}),
        ("bookings", [("status", 1), ("hold_expires_at", 1)], {}),
        ("bookings", [("stripe_session_id", 1)], {"sparse": True}),
        # transactions
        ("transactions", [("business_id", 1), ("created_at", -1)], {}),
        ("transactions", [("user_id", 1), ("created_at", -1)], {}),
        ("transactions", [("funds_state", 1), ("business_id", 1)], {}),
        ("transactions", [("settlement_id", 1)], {"sparse": True}),
        ("transactions", [("stripe_session_id", 1)], {"sparse": True}),
        ("transactions", [("booking_id", 1)], {"sparse": True}),
        # reviews
        ("reviews", [("business_id", 1), ("created_at", -1)], {}),
        ("reviews", [("user_id", 1)], {}),
        # notifications: bell badge counts query daily
        ("notifications", [("user_id", 1), ("is_read", 1), ("created_at", -1)], {}),
        # wallet
        ("user_wallets", [("user_id", 1)], {"unique": True}),
        ("wallet_transactions", [("user_id", 1), ("created_at", -1)], {}),
        # strikes
        ("strikes", [("business_id", 1), ("status", 1)], {}),
        ("strikes", [("business_id", 1), ("created_at", -1)], {}),
        # settlements
        ("settlements", [("business_id", 1), ("period_key", 1)], {}),
        ("settlements", [("status", 1), ("period_key", 1)], {}),
        # support tickets
        ("support_tickets", [("status", 1), ("created_at", -1)], {}),
        ("support_tickets", [("reporter_user_id", 1)], {"sparse": True}),
        # favorites
        ("user_favorites", [("user_id", 1), ("business_id", 1)], {"unique": True}),
        # qr scans
        ("qr_scans", [("business_id", 1), ("scanned_at", -1)], {}),
        # audit log
        ("audit_logs", [("created_at", -1)], {}),
        ("audit_logs", [("actor_id", 1), ("created_at", -1)], {}),
    ]
    _idx_ok, _idx_fail = 0, 0
    for _coll, _keys, _opts in _index_specs:
        try:
            await _db_idx[_coll].create_index(_keys, **_opts)
            _idx_ok += 1
        except Exception as _e:
            _idx_fail += 1
            logger.warning(f"Index {_coll}{_keys} failed: {_e}")
    logger.info(f"MongoDB performance indexes: {_idx_ok} ok, {_idx_fail} failed")

    # ------------------------------------------------------------------
    # Fase 8 grandfather clause: any business that was already APPROVED
    # before the documents_verified flag existed keeps receiving bookings.
    # New businesses will flip to documents_verified=False on first legal
    # doc update (see /businesses/me/legal-docs) until admin approves.
    # ------------------------------------------------------------------
    try:
        from core.database import db
        grandfather = await db.businesses.update_many(
            {
                "status": "approved",
                "documents_verified": {"$exists": False},
            },
            {"$set": {"documents_verified": True, "documents_grandfathered": True}},
        )
        if grandfather.modified_count:
            logger.info(
                f"Fase 8 grandfather: marked {grandfather.modified_count} businesses as documents_verified=True"
            )
    except Exception as e:
        logger.warning(f"Fase 8 grandfather backfill failed: {e}")

    # ------------------------------------------------------------------
    # Fase 10 migration: seed terms_acceptance_history for accounts that
    # were created before the audit trail was introduced. We only seed
    # when the account already has accepted_terms_version + at (so we
    # never fabricate evidence for users who never accepted).
    # ------------------------------------------------------------------
    try:
        from core.database import db
        migrated_users = await db.users.update_many(
            {
                "accepted_terms_version": {"$exists": True, "$ne": None},
                "accepted_terms_at": {"$exists": True, "$ne": None},
                "terms_acceptance_history": {"$exists": False},
            },
            [{"$set": {
                "terms_acceptance_history": [{
                    "version": "$accepted_terms_version",
                    "accepted_at": "$accepted_terms_at",
                    "ip": "",
                    "user_agent": "",
                    "source": "migration",
                }]
            }}],
        )
        migrated_biz = await db.businesses.update_many(
            {
                "accepted_terms_version": {"$exists": True, "$ne": None},
                "accepted_terms_at": {"$exists": True, "$ne": None},
                "terms_acceptance_history": {"$exists": False},
            },
            [{"$set": {
                "terms_acceptance_history": [{
                    "version": "$accepted_terms_version",
                    "accepted_at": "$accepted_terms_at",
                    "ip": "",
                    "user_agent": "",
                    "source": "migration",
                }]
            }}],
        )
        total = migrated_users.modified_count + migrated_biz.modified_count
        if total:
            logger.info(f"Fase 10 terms history migration: seeded {total} documents")
    except Exception as e:
        logger.warning(f"Fase 10 terms history migration failed: {e}")

    # Start background schedulers
    asyncio.create_task(appointment_reminder_scheduler())
    asyncio.create_task(subscription_reminder_scheduler())
    asyncio.create_task(subscription_enforcement_scheduler())  # Phase D
    asyncio.create_task(wallet_expiration_scheduler())
    asyncio.create_task(funds_state_scheduler())
    asyncio.create_task(settlement_day20_scheduler())
    asyncio.create_task(expire_holds_scheduler())
    asyncio.create_task(stripe_reconciliation_scheduler())
    asyncio.create_task(monthly_pnl_report_scheduler())
    try:
        from services.refund_choice_reminder import refund_choice_reminder_scheduler
        asyncio.create_task(refund_choice_reminder_scheduler())
    except Exception as _e:
        logger.warning(f"Refund-choice reminder scheduler not started: {_e}")
    # MongoDB daily backup to Cloudinary
    try:
        from services.mongo_backup import mongo_backup_scheduler
        asyncio.create_task(mongo_backup_scheduler())
    except Exception as _e:
        logger.warning(f"Mongo backup scheduler not started: {_e}")


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
    from routers.bookings import _calendar_token
    now = datetime.now(timezone.utc)

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
                user = await db.users.find_one({"id": booking["user_id"]}, {"_id": 0, "email": 1, "full_name": 1, "notify_email": 1})
                if not user:
                    continue
                service = await db.services.find_one({"id": booking["service_id"]}, {"_id": 0, "name": 1})

                # ---- Smart reminder data ----
                # Cancellation policy: free refund only if cancelled >24h before appointment
                cancel_cutoff_local = (local_dt - timedelta(hours=24))
                # Reschedule policy: must be done >2h before appointment
                from models.enums import RESCHEDULE_CUTOFF_HOURS, MAX_RESCHEDULES_PER_BOOKING
                reschedule_cutoff_local = (local_dt - timedelta(hours=RESCHEDULE_CUTOFF_HOURS))

                _MONTHS = {1:"ene",2:"feb",3:"mar",4:"abr",5:"may",6:"jun",7:"jul",8:"ago",9:"sep",10:"oct",11:"nov",12:"dic"}
                def _fmt(local: datetime) -> str:
                    return f"{local.day} {_MONTHS[local.month]} {local.strftime('%H:%M')} hrs"

                cancel_text = _fmt(cancel_cutoff_local) if (cancel_cutoff_local.astimezone(pytz.utc) > now) else None
                reschedule_text = _fmt(reschedule_cutoff_local) if (reschedule_cutoff_local.astimezone(pytz.utc) > now) else None

                used = int(booking.get("reschedule_count") or 0)
                remaining = max(0, MAX_RESCHEDULES_PER_BOOKING - used)
                if reschedule_text is None:
                    remaining = 0

                token = _calendar_token(booking["id"])
                public_api = os.environ.get("PUBLIC_API_URL") or "https://api.bookvia.app"
                calendar_url = f"{public_api}/api/bookings/{booking['id']}/calendar.ics?token={token}"

                # Google Calendar "add event" URL (RFC-compliant compact UTC format)
                from urllib.parse import quote
                utc_end = (utc_dt + timedelta(minutes=int(
                    (service or {}).get("duration_minutes")
                    or (service or {}).get("duration")
                    or booking.get("duration_minutes")
                    or 60
                )))
                gcal_dates = f"{utc_dt.strftime('%Y%m%dT%H%M%SZ')}/{utc_end.strftime('%Y%m%dT%H%M%SZ')}"
                gcal_text = quote(f"Cita en {business.get('name','Bookvia')}")
                gcal_details = quote(f"Servicio: {(service or {}).get('name','')}\\nReserva: https://bookvia.vercel.app/bookings")
                gcal_location = quote(business.get("address", "") or "")
                google_calendar_url = (
                    f"https://calendar.google.com/calendar/render?action=TEMPLATE"
                    f"&text={gcal_text}&dates={gcal_dates}&details={gcal_details}&location={gcal_location}"
                )

                try:
                    if user.get("notify_email", True):
                        try:
                            from services.email import send_appointment_reminder
                            worker = await db.workers.find_one({"id": booking.get("worker_id")}, {"_id": 0, "name": 1}) if booking.get("worker_id") else None
                            await send_appointment_reminder(
                                user_email=user["email"],
                                user_name=user.get("full_name", ""),
                                business_name=business.get("name", ""),
                                service_name=service.get("name", "") if service else "",
                                date=date_str,
                                time=time_str,
                                worker_name=worker.get("name", "") if worker else "",
                                business_address=business.get("address", ""),
                                booking_id=booking["id"],
                                cancel_free_until_text=cancel_text,
                                reschedule_until_text=reschedule_text,
                                reschedule_remaining=remaining,
                                calendar_url=calendar_url,
                                google_calendar_url=google_calendar_url,
                            )
                        except Exception as email_err:
                            # Do not block push + reminder_sent flag if email provider fails
                            logger.warning(f"Email reminder failed for booking {booking.get('id')}: {email_err}")

                    # Push notification (in-app) regardless of email pref
                    try:
                        from core.helpers import create_notification
                        push_msg = (
                            f"Tu cita en {business.get('name','')} es el {date_str} a las {time_str}."
                        )
                        if reschedule_text and remaining > 0:
                            push_msg += f" Puedes reagendar gratis hasta el {reschedule_text}."
                        elif cancel_text:
                            push_msg += f" Cancelacion con reembolso hasta el {cancel_text}."
                        await create_notification(
                            user_id=booking["user_id"],
                            title="Recordatorio de cita",
                            message=push_msg,
                            notif_type="booking_reminder",
                            data={
                                "booking_id": booking["id"],
                                "business_id": booking["business_id"],
                                "date": date_str,
                                "time": time_str,
                                "cancel_free_until": cancel_text,
                                "reschedule_until": reschedule_text,
                                "reschedule_remaining": remaining,
                            },
                        )
                    except Exception as ne:
                        logger.warning(f"Push reminder failed for booking {booking.get('id')}: {ne}")

                    await db.bookings.update_one(
                        {"id": booking["id"]},
                        {"$set": {"reminder_sent": True, "reminder_sent_at": now.isoformat()}}
                    )
                    logger.info(f"Smart reminder sent for booking {booking['id']} to {user['email']}")
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


async def subscription_enforcement_scheduler():
    """Phase D — Daily: suspend businesses with >=7d unpaid, cancel >=30d."""
    logger.info("Subscription enforcement scheduler started")
    await asyncio.sleep(900)  # 15 min after startup
    while True:
        try:
            from services.subscription_enforcement import run_subscription_enforcement
            result = await run_subscription_enforcement()
            if result.get("suspended", 0) > 0 or result.get("canceled", 0) > 0:
                logger.info(f"Subscription enforcement: {result}")
        except Exception as e:
            logger.error(f"Subscription enforcement error: {e}")
        await asyncio.sleep(86400)  # 24 hours


async def wallet_expiration_scheduler():
    """Daily task: expire wallet balances inactive for >= 24 months."""
    logger.info("Wallet expiration scheduler started")
    await asyncio.sleep(600)  # Wait 10 min after startup
    while True:
        try:
            from services.wallet import expire_stale_balances
            count = await expire_stale_balances()
            if count > 0:
                logger.info(f"Wallet expiration: zeroed out {count} balances")
        except Exception as e:
            logger.error(f"Wallet expiration scheduler error: {e}")
        await asyncio.sleep(86400)  # 24 hours


async def funds_state_scheduler():
    """
    Hourly task driving the transaction funds_state lifecycle:
      1. Auto-complete bookings 48h after their scheduled end without business action.
      2. Auto-clear AVAILABLE transactions whose 24h grace window elapsed.
      3. Lift expired business suspensions.
    """
    logger.info("Funds state scheduler started")
    await asyncio.sleep(180)  # Wait 3 min after startup
    while True:
        try:
            from services.funds_state import auto_complete_appointments, auto_clear_after_grace
            from services.strikes import lift_expired_suspensions
            from routers.bookings import process_expired_no_show_reports
            ac = await auto_complete_appointments()
            cl = await auto_clear_after_grace()
            ls = await lift_expired_suspensions()
            ns = await process_expired_no_show_reports()
            if ac or cl or ls or ns:
                logger.info(f"Funds state cron: auto_completed={ac}, auto_cleared={cl}, suspensions_lifted={ls}, no_show_resolved={ns}")
        except Exception as e:
            logger.error(f"Funds state scheduler error: {e}")
        await asyncio.sleep(3600)  # Every 1 hour


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



async def settlement_day20_scheduler():
    """Run the day-20 settlement job once per day; only acts on day 20.

    We re-use the idempotency of `generate_settlements_day20`: if the job
    was already run in this calendar month, the CLEARED transactions are
    already tagged with `settlement_id` and won't be picked up again.
    """
    logger.info("Settlement day-20 scheduler started")
    await asyncio.sleep(120)
    last_run_date = None
    while True:
        try:
            now = datetime.now(timezone.utc)
            today_key = now.strftime("%Y-%m-%d")
            if now.day == 20 and last_run_date != today_key:
                logger.info(f"[day20] Running settlement generation for {today_key}")
                from routers.admin import generate_settlements_day20
                result = await generate_settlements_day20(run_date=now, force=False, admin_id="cron_day20")
                logger.info(f"[day20] Finished: {result.get('settlements_created', 0)} settlements created")
                last_run_date = today_key
        except Exception as e:
            logger.error(f"Settlement day-20 scheduler error: {e}")
        # Check every hour
        await asyncio.sleep(3600)



async def expire_holds_scheduler():
    """Fase 11: runs `expire_holds_task` every 5 min to release stale
    transactions that never made it to PAID (client abandoned Stripe).
    """
    logger.info("Expire-holds scheduler started")
    await asyncio.sleep(60)
    while True:
        try:
            from routers.payments import expire_holds_task
            count = await expire_holds_task()
            if count:
                logger.info(f"[expire_holds] released {count} stale transactions")
        except Exception as e:
            logger.error(f"expire_holds scheduler error: {e}")
        await asyncio.sleep(300)


async def stripe_reconciliation_scheduler():
    """Fase 12c: runs daily at ~04:00 UTC (22:00 CDMX, low traffic) a
    reconciliation against stripe.BalanceTransaction.list for the
    previous UTC day.
    """
    logger.info("Stripe reconciliation scheduler started")
    last_run_date = None
    await asyncio.sleep(60)
    while True:
        try:
            now = datetime.now(timezone.utc)
            today_key = now.strftime("%Y-%m-%d")
            if now.hour >= 4 and last_run_date != today_key:
                from services.reconciliation import reconcile_with_stripe
                res = await reconcile_with_stripe()
                logger.info(f"[stripe_reconcile] {res}")
                last_run_date = today_key
        except Exception as e:
            logger.error(f"Stripe reconciliation scheduler error: {e}")
        await asyncio.sleep(1800)  # every 30 min check if it's time to run


async def monthly_pnl_report_scheduler():
    """Fase 12d: emails the executive P&L digest to every admin on day-1
    of each month around 13:00 UTC (07:00 CDMX). Idempotent: stores the
    last successfully processed period in memory so hot-reloads don't
    double-send inside the same run hour window.
    """
    logger.info("Monthly P&L report scheduler started")
    last_period = None
    await asyncio.sleep(180)
    while True:
        try:
            now = datetime.now(timezone.utc)
            # Period key is the previous month being reported on.
            prev_year = now.year if now.month > 1 else now.year - 1
            prev_month = now.month - 1 if now.month > 1 else 12
            period_key = f"{prev_year}-{str(prev_month).zfill(2)}"
            if now.day == 1 and now.hour >= 13 and last_period != period_key:
                from services.monthly_pnl_report import send_monthly_report
                res = await send_monthly_report(now=now)
                logger.info(f"[monthly_pnl_report] sent to {len(res.get('sent_to', []))} admins for {period_key}")
                last_period = period_key
        except Exception as e:
            logger.error(f"Monthly P&L report scheduler error: {e}")
        await asyncio.sleep(1800)  # every 30 min check if it's time to run

