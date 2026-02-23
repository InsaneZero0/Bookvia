"""
Worker schemas.
"""
from pydantic import BaseModel, ConfigDict
from typing import Optional, List, Dict, Any


class ScheduleBlock(BaseModel):
    """A time block within a day"""
    start_time: str  # "09:00"
    end_time: str    # "14:00"


class DaySchedule(BaseModel):
    """Schedule for a single day with multiple blocks"""
    is_available: bool = True
    blocks: List[ScheduleBlock] = []


class WorkerException(BaseModel):
    """Exception (vacation/block) with date range support"""
    start_date: str  # "2024-01-15"
    end_date: str    # "2024-01-15" or "2024-01-20" (range)
    start_time: Optional[str] = None  # "09:00" - if null, full day
    end_time: Optional[str] = None    # "12:00" - if null, full day
    reason: Optional[str] = None
    exception_type: str = "block"  # "vacation" | "block"


class WorkerCreate(BaseModel):
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    photo_url: Optional[str] = None
    bio: Optional[str] = None
    service_ids: List[str] = []


class WorkerUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    photo_url: Optional[str] = None
    bio: Optional[str] = None
    service_ids: Optional[List[str]] = None


class WorkerResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    business_id: str
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    photo_url: Optional[str] = None
    bio: Optional[str] = None
    service_ids: List[str] = []
    schedule: Dict[str, Any] = {}
    exceptions: List[Dict[str, Any]] = []
    active: bool = True
    created_at: Optional[str] = None
    deactivated_at: Optional[str] = None


class WorkerScheduleUpdate(BaseModel):
    """Update schedule for multiple days"""
    schedule: Dict[str, DaySchedule]


class WorkerExceptionAdd(BaseModel):
    """Add an exception"""
    exception: WorkerException


class ServiceCreate(BaseModel):
    name: str
    description: Optional[str] = None
    duration_minutes: int = 60
    price: float
    category_id: Optional[str] = None
    is_home_service: bool = False
    allowed_worker_ids: List[str] = []


class ServiceUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    duration_minutes: Optional[int] = None
    price: Optional[float] = None
    category_id: Optional[str] = None
    is_home_service: Optional[bool] = None
    allowed_worker_ids: Optional[List[str]] = None


class ServiceResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    business_id: str
    name: str
    description: Optional[str] = None
    duration_minutes: int
    price: float
    category_id: Optional[str] = None
    is_home_service: bool = False
    allowed_worker_ids: List[str] = []
    active: bool = True
