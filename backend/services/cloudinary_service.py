"""Cloudinary storage service for Bookvia image uploads."""
import os
import uuid
import logging
import cloudinary
import cloudinary.uploader

logger = logging.getLogger(__name__)

ALLOWED_EXTENSIONS = {"jpg", "jpeg", "png", "webp", "gif", "jfif"}
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5MB

# Folder structure in Cloudinary
FOLDERS = {
    "business_logo": "bookvia/businesses/logos",
    "business_gallery": "bookvia/businesses/gallery",
    "user_profile": "bookvia/users/profiles",
}

_initialized = False


def init_cloudinary():
    """Initialize Cloudinary from environment variables. Call once at startup."""
    global _initialized
    cloud_name = os.environ.get("CLOUDINARY_CLOUD_NAME")
    api_key = os.environ.get("CLOUDINARY_API_KEY")
    api_secret = os.environ.get("CLOUDINARY_API_SECRET")

    if not all([cloud_name, api_key, api_secret]):
        logger.warning("Cloudinary credentials not configured. Image uploads will fail.")
        return False

    cloudinary.config(
        cloud_name=cloud_name,
        api_key=api_key,
        api_secret=api_secret,
        secure=True,
    )
    _initialized = True
    logger.info("Cloudinary initialized successfully")
    return True


def is_configured():
    return _initialized


def validate_image(filename: str, content_type: str, size: int):
    """Validate file is an allowed image within size limit."""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in ALLOWED_EXTENSIONS:
        return False, f"Format not allowed: .{ext}. Use: {', '.join(ALLOWED_EXTENSIONS)}"
    if size > MAX_FILE_SIZE:
        return False, f"File too large ({size // 1024}KB). Maximum: {MAX_FILE_SIZE // 1024 // 1024}MB"
    return True, ""


def upload_image(file_data: bytes, folder_key: str, entity_id: str = "") -> dict:
    """Upload image to Cloudinary. Returns {secure_url, public_id}."""
    if not _initialized:
        raise RuntimeError("Cloudinary not configured")

    folder = FOLDERS.get(folder_key, "bookvia/misc")
    public_id = f"{folder}/{entity_id}/{uuid.uuid4().hex[:12]}" if entity_id else f"{folder}/{uuid.uuid4().hex[:12]}"

    result = cloudinary.uploader.upload(
        file_data,
        public_id=public_id,
        overwrite=True,
        resource_type="image",
        format="webp",
        transformation=[{"quality": "auto", "fetch_format": "auto"}],
    )

    return {
        "secure_url": result["secure_url"],
        "public_id": result["public_id"],
    }


def delete_image(public_id: str) -> bool:
    """Delete image from Cloudinary by public_id."""
    if not _initialized or not public_id:
        return False
    try:
        result = cloudinary.uploader.destroy(public_id, resource_type="image")
        return result.get("result") == "ok"
    except Exception as e:
        logger.error(f"Cloudinary delete error: {e}")
        return False
