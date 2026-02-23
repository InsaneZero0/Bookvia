"""
Notification service for internal notifications.
"""
from datetime import datetime, timezone
from typing import Optional, Dict, Any

from core.database import db
from models.enums import NotificationType
from utils.helpers import generate_id


async def create_notification(
    user_id: str,
    title: str,
    message: str,
    notif_type: str,
    data: Optional[Dict[str, Any]] = None
) -> str:
    """
    Create an internal notification for a user.
    
    Returns:
        Notification ID
    """
    notification = {
        "id": generate_id(),
        "user_id": user_id,
        "title": title,
        "message": message,
        "type": notif_type,
        "read": False,
        "data": data or {},
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.notifications.insert_one(notification)
    return notification["id"]


async def create_booking_notification(
    user_id: str,
    booking_id: str,
    business_name: str,
    service_name: str,
    date: str,
    time: str
) -> str:
    """Create booking confirmation notification"""
    return await create_notification(
        user_id=user_id,
        title="Cita confirmada",
        message=f"Tu cita en {business_name} para {service_name} el {date} a las {time} ha sido confirmada.",
        notif_type=NotificationType.BOOKING_CONFIRMED,
        data={"booking_id": booking_id}
    )


async def create_worker_assignment_notification(
    worker_user_id: str,
    booking_id: str,
    client_name: str,
    service_name: str,
    date: str,
    time: str
) -> str:
    """Create worker assignment notification"""
    return await create_notification(
        user_id=worker_user_id,
        title="Nueva cita asignada",
        message=f"Se te ha asignado una cita: {service_name} con {client_name} el {date} a las {time}.",
        notif_type=NotificationType.WORKER_ASSIGNED,
        data={"booking_id": booking_id}
    )


async def create_cancellation_notification(
    user_id: str,
    booking_id: str,
    business_name: str,
    reason: Optional[str] = None
) -> str:
    """Create cancellation notification"""
    message = f"Tu cita en {business_name} ha sido cancelada."
    if reason:
        message += f" Motivo: {reason}"
    
    return await create_notification(
        user_id=user_id,
        title="Cita cancelada",
        message=message,
        notif_type=NotificationType.BOOKING_CANCELLED,
        data={"booking_id": booking_id}
    )


async def get_user_notifications(
    user_id: str,
    unread_only: bool = False,
    limit: int = 50
) -> list:
    """Get notifications for a user"""
    filters = {"user_id": user_id}
    if unread_only:
        filters["read"] = False
    
    notifications = await db.notifications.find(
        filters,
        {"_id": 0}
    ).sort("created_at", -1).limit(limit).to_list(limit)
    
    return notifications


async def mark_notification_read(notification_id: str, user_id: str) -> bool:
    """Mark a notification as read"""
    result = await db.notifications.update_one(
        {"id": notification_id, "user_id": user_id},
        {"$set": {"read": True, "read_at": datetime.now(timezone.utc).isoformat()}}
    )
    return result.modified_count > 0


async def mark_all_read(user_id: str) -> int:
    """Mark all notifications as read for a user"""
    result = await db.notifications.update_many(
        {"user_id": user_id, "read": False},
        {"$set": {"read": True, "read_at": datetime.now(timezone.utc).isoformat()}}
    )
    return result.modified_count


async def get_unread_count(user_id: str) -> int:
    """Get count of unread notifications"""
    return await db.notifications.count_documents({
        "user_id": user_id,
        "read": False
    })
