"""
InfecSure — Pydantic Models: Users
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, EmailStr


class UserRole(str, Enum):
    ICNO = "icno"
    SISTER = "sister"
    LAB = "lab"
    DOCTOR = "doctor"
    STAFF = "staff"


class UserProfile(BaseModel):
    uid: str
    email: EmailStr
    full_name: str
    role: UserRole
    is_active: bool = True
    created_at: Optional[datetime] = None


class CreateUserRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    role: UserRole


class UpdateUserRequest(BaseModel):
    full_name: Optional[str] = None
    is_active: Optional[bool] = None
    role: Optional[UserRole] = None


class UserPublicProfile(BaseModel):
    """Minimal profile safe to return in list views."""
    uid: str
    full_name: str
    role: UserRole
    is_active: bool
