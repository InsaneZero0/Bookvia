"""
MongoDB Backup Service — hosting-agnostic daily snapshots.

Why this approach (instead of relying on MongoDB Atlas backups):
  * Bookvia's Mongo URL may live on Atlas, Railway addon, or self-hosted —
    this code does not care. It only needs a Mongo connection.
  * Atlas Free Tier (M0) does NOT include automated backups. Paid backups
    start at $15/mo per cluster. This service does the same for free using
    Cloudinary storage you already have.
  * Cloudinary "raw" file uploads are free up to 25 GB total storage,
    well within Bookvia's needs for years.

Backup process (runs daily):
  1. List all collections in the active DB.
  2. Stream-dump each collection as a JSON array (ObjectId → str via custom
     encoder so the dump is portable).
  3. Pack everything into a single .json file inside an in-memory gzip.
  4. Upload to Cloudinary as `resource_type=raw` under folder `bookvia-backups/`
     with public_id = `{db_name}-{utc_isoformat}`.
  5. Store metadata in `mongo_backups` collection so admin can list/restore.
  6. Keep last 30 backups; older ones are deleted from Cloudinary + DB.

Restore is manual (admin downloads JSON + runs mongorestore-equivalent
script). The point of this service is to guarantee the data is SAFE.
"""
from __future__ import annotations

import asyncio
import gzip
import io
import json
import logging
import os
from bson import ObjectId
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from core.database import db

logger = logging.getLogger(__name__)

# How many backups to keep (older ones are deleted from Cloudinary).
RETENTION_COUNT = int(os.environ.get("MONGO_BACKUP_RETENTION", "30"))

# Collections we deliberately SKIP (logs/temp data that bloats the dump
# without protecting business-critical info).
SKIP_COLLECTIONS = {
    "audit_logs",         # high-volume, ephemeral
    "qr_scans",           # high-volume marketing data
    "profile_views",      # marketing telemetry
    "stripe_events",      # idempotency cache, replayable from Stripe
    "rate_limits",        # ephemeral
    "sessions",           # ephemeral auth tokens
}


class _BsonEncoder(json.JSONEncoder):
    """JSON encoder that handles BSON types Mongo returns."""
    def default(self, o):  # noqa: D401
        if isinstance(o, ObjectId):
            return str(o)
        if isinstance(o, datetime):
            return o.isoformat()
        return super().default(o)


async def create_backup() -> Dict[str, Any]:
    """Create a full database snapshot and upload to Cloudinary.

    Returns a dict with the cloudinary URL, size, collection counts and
    backup id. Caller can persist this dict and surface in admin UI.
    """
    db_name = os.environ.get("DB_NAME", "")
    if not db_name:
        return {"ok": False, "reason": "no_db_name"}

    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup_id = f"{db_name}-{ts}"

    # Collect all docs from every collection (except skipped ones)
    collection_names: List[str] = await db.list_collection_names()
    payload: Dict[str, Any] = {
        "backup_id": backup_id,
        "db_name": db_name,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "schema_version": 1,
        "collections": {},
    }
    counts: Dict[str, int] = {}
    total_docs = 0

    for name in collection_names:
        if name in SKIP_COLLECTIONS or name.startswith("system."):
            continue
        try:
            docs = await db[name].find({}).to_list(length=None)
            payload["collections"][name] = docs
            counts[name] = len(docs)
            total_docs += len(docs)
        except Exception as e:
            logger.warning(f"Backup: failed dumping collection {name}: {e}")
            counts[name] = -1  # mark as failed but continue

    # Gzip the JSON payload in memory
    raw = json.dumps(payload, cls=_BsonEncoder).encode("utf-8")
    buf = io.BytesIO()
    with gzip.GzipFile(fileobj=buf, mode="wb", compresslevel=6) as gz:
        gz.write(raw)
    compressed = buf.getvalue()
    size_mb = round(len(compressed) / (1024 * 1024), 2)

    # Upload to Cloudinary as raw resource
    cloudinary_url: Optional[str] = None
    upload_ok = False
    try:
        import cloudinary
        import cloudinary.uploader
        cloudinary.config(
            cloud_name=os.environ.get("CLOUDINARY_CLOUD_NAME"),
            api_key=os.environ.get("CLOUDINARY_API_KEY"),
            api_secret=os.environ.get("CLOUDINARY_API_SECRET"),
            secure=True,
        )
        # Cloudinary expects a file-like; pass bytes via io.BytesIO
        upload_buf = io.BytesIO(compressed)
        upload_buf.name = f"{backup_id}.json.gz"
        res = cloudinary.uploader.upload(
            upload_buf,
            resource_type="raw",
            folder="bookvia-backups",
            public_id=backup_id,
            overwrite=False,
            use_filename=False,
            unique_filename=False,
            tags=["mongo-backup", db_name],
        )
        cloudinary_url = res.get("secure_url")
        upload_ok = bool(cloudinary_url)
    except Exception as e:
        logger.error(f"Backup upload to Cloudinary failed: {e}")

    # Record metadata in mongo_backups collection
    record = {
        "id": backup_id,
        "db_name": db_name,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "size_bytes": len(compressed),
        "size_mb": size_mb,
        "total_docs": total_docs,
        "counts": counts,
        "cloudinary_url": cloudinary_url,
        "upload_ok": upload_ok,
        "retention_until": (datetime.now(timezone.utc) + timedelta(days=RETENTION_COUNT)).isoformat(),
    }
    await db.mongo_backups.insert_one({**record, "_id": backup_id})
    record.pop("_id", None)

    # Rotate: keep last N backups, delete older
    try:
        all_backups = await db.mongo_backups.find(
            {"upload_ok": True}, {"_id": 0, "id": 1, "cloudinary_url": 1}
        ).sort("created_at", -1).to_list(length=None)
        if len(all_backups) > RETENTION_COUNT:
            to_delete = all_backups[RETENTION_COUNT:]
            for old in to_delete:
                try:
                    import cloudinary.api
                    cloudinary.api.delete_resources(
                        [f"bookvia-backups/{old['id']}"],
                        resource_type="raw",
                    )
                except Exception as e:
                    logger.warning(f"Backup rotate: cloudinary delete of {old['id']} failed: {e}")
                await db.mongo_backups.delete_one({"id": old["id"]})
            logger.info(f"Backup rotate: pruned {len(to_delete)} old backups")
    except Exception as e:
        logger.warning(f"Backup retention pass failed (non-blocking): {e}")

    if upload_ok:
        logger.info(
            f"Mongo backup OK id={backup_id} size={size_mb}MB docs={total_docs} "
            f"collections={len(counts)} → {cloudinary_url}"
        )
    else:
        logger.error(f"Mongo backup FAILED to upload id={backup_id} size={size_mb}MB")

    return record


async def list_backups(limit: int = 50) -> List[Dict[str, Any]]:
    rows = await db.mongo_backups.find(
        {}, {"_id": 0}
    ).sort("created_at", -1).limit(limit).to_list(length=limit)
    return rows


async def mongo_backup_scheduler() -> None:
    """Background loop: take a backup once every 24h, jittered after start.

    First run: 5 min after server boots (gives the app time to settle, and
    catches days where the deploy happened to be the backup hour).
    """
    logger.info("MongoDB backup scheduler started")
    await asyncio.sleep(300)  # 5 min after boot

    while True:
        try:
            # Skip if Cloudinary isn't configured — better to log than to
            # accumulate failed records.
            if not os.environ.get("CLOUDINARY_CLOUD_NAME"):
                logger.warning("Mongo backup: CLOUDINARY_CLOUD_NAME missing, skipping")
            else:
                await create_backup()
        except Exception as e:
            logger.exception(f"Mongo backup loop iteration failed: {e}")

        # Sleep ~24h. Use 23h57min so backups drift slightly day over day
        # and avoid hammering Cloudinary exactly at midnight UTC.
        await asyncio.sleep(23 * 3600 + 57 * 60)
