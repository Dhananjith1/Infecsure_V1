"""
InfecSure — Pydantic Models: Authentication
"""

from pydantic import BaseModel, EmailStr


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


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
