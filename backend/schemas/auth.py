"""
Authentication and user schemas.
"""
from pydantic import BaseModel, ConfigDict, EmailStr
from typing import Optional, List


class UserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    phone: str
    preferred_language: str = "es"


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    email: str
    full_name: str
    phone: str
    phone_verified: bool = False
    role: str
    preferred_language: str = "es"
    photo_url: Optional[str] = None
    birth_date: Optional[str] = None
    gender: Optional[str] = None
    favorites: List[str] = []
    active_appointments_count: int = 0
    completed_appointments_count: int = 0
    no_show_count: int = 0
    suspended_until: Optional[str] = None
    created_at: str


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    preferred_language: Optional[str] = None
    photo_url: Optional[str] = None
    birth_date: Optional[str] = None
    gender: Optional[str] = None


class PhoneVerifyRequest(BaseModel):
    phone: str


class PhoneVerifyConfirm(BaseModel):
    phone: str
    code: str
    user_id: Optional[str] = None


class Admin2FASetup(BaseModel):
    password: str


class Admin2FAVerify(BaseModel):
    code: str


class AdminLogin(BaseModel):
    email: EmailStr
    password: str
    totp_code: Optional[str] = None
