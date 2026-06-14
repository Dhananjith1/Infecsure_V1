"""
InfecSure — Pydantic Models: Authentication
"""

from pydantic import BaseModel, EmailStr, Field


class LoginRequest(BaseModel):
    email: EmailStr = Field(..., examples=["icno@infecsure.com"])
    password: str = Field(..., min_length=1, examples=["your-firebase-password"])


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    role: str
    uid: str


class RefreshRequest(BaseModel):
    refresh_token: str


class TokenData(BaseModel):
    uid: str
    email: str
    role: str
