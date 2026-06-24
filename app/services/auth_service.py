"""
InfecSure - Authentication Service
"""

from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx
from jose import JWTError, jwt

from app.config import auth_client, db, get_settings
from app.models.auth import TokenData, TokenResponse

settings = get_settings()

FIREBASE_WEB_API_KEY = settings.firebase_web_api_key or os.environ.get("FIREBASE_WEB_API_KEY", "")
ALLOWED_ROLES = {"icno", "sister", "lab", "doctor", "staff"}


def _create_token(data: dict, expires_delta: timedelta) -> str:
    payload = data.copy()
    now = datetime.now(timezone.utc)
    payload.update({"exp": now + expires_delta, "iat": now})
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def create_access_token(uid: str, email: str, role: str) -> str:
    return _create_token(
        {"sub": uid, "email": email, "role": role, "type": "access"},
        timedelta(minutes=settings.access_token_expire_minutes),
    )


def create_refresh_token(uid: str, email: str, role: str) -> str:
    return _create_token(
        {"sub": uid, "email": email, "role": role, "type": "refresh"},
        timedelta(days=settings.refresh_token_expire_days),
    )


def decode_token(token: str) -> TokenData:
    payload = jwt.decode(
        token,
        settings.jwt_secret_key,
        algorithms=[settings.jwt_algorithm],
    )
    uid: str = payload.get("sub")
    email: str = payload.get("email")
    role: str = payload.get("role")
    if not uid or not email or not role:
        raise JWTError("Invalid token payload")
    return TokenData(uid=uid, email=email, role=role)


async def firebase_sign_in(email: str, password: str) -> dict:
    """
    Verify email/password through Firebase Authentication REST API.
    """
    if not FIREBASE_WEB_API_KEY:
        raise RuntimeError(
            "FIREBASE_WEB_API_KEY is required for secure email/password login."
        )

    url = (
        "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword"
        f"?key={FIREBASE_WEB_API_KEY}"
    )
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            url,
            json={"email": email, "password": password, "returnSecureToken": True},
            timeout=10,
        )
    data = resp.json()
    if "error" in data:
        raise ValueError(data["error"].get("message", "Authentication failed"))
    return data


def admin_verify_user(email: str) -> Optional[dict]:
    try:
        user = auth_client.get_user_by_email(email)
        return {"uid": user.uid, "email": user.email, "display_name": user.display_name}
    except Exception:
        return None


def _clean_role(role: Optional[str]) -> Optional[str]:
    if not role:
        return None
    role_value = str(role).strip().lower()
    return role_value if role_value in ALLOWED_ROLES else None


def role_from_authenticated_user(user_doc: Optional[dict], uid: str) -> Optional[str]:
    """
    Resolve RBAC role only from trusted backend data:
    1. Firestore users/{uid} or users query profile.
    2. Firebase Auth custom claims (`role`) as fallback.
    """
    profile_role = _clean_role(user_doc.get("role") if user_doc else None)
    if profile_role:
        return profile_role

    try:
        fb_user = auth_client.get_user(uid)
        claims = fb_user.custom_claims or {}
        return _clean_role(claims.get("role"))
    except Exception:
        return None


def build_token_response(uid: str, email: str, role: str) -> TokenResponse:
    return TokenResponse(
        access_token=create_access_token(uid, email, role),
        refresh_token=create_refresh_token(uid, email, role),
        role=role,
        uid=uid,
    )


DEFAULT_USERS = [
    {"email": "icno@infecsure.com", "password_env": "SEED_ICNO_PASSWORD", "name": "ICNO Officer", "role": "icno"},
    {"email": "matron@infecsure.com", "password_env": "SEED_SISTER_PASSWORD", "name": "Acting Matron", "role": "sister"},
    {"email": "lab@infecsure.com", "password_env": "SEED_LAB_PASSWORD", "name": "Lab Personnel", "role": "lab"},
    {"email": "doctor@infecsure.com", "password_env": "SEED_DOCTOR_PASSWORD", "name": "Supervising Doctor", "role": "doctor"},
    {"email": "staff@infecsure.com", "password_env": "SEED_STAFF_PASSWORD", "name": "Hospital Staff", "role": "staff"},
]


async def seed_default_users() -> None:
    """
    Idempotently create configured default accounts.
    Passwords must come from SEED_* environment variables.
    """
    users_ref = db.collection("users")
    seeded_count = 0

    for user_data in DEFAULT_USERS:
        email = user_data["email"]
        password = os.environ.get(user_data["password_env"], "")
        if not password:
            continue

        existing = users_ref.where("email", "==", email).limit(1).get()
        if existing:
            continue

        try:
            fb_user = auth_client.create_user(
                email=email,
                password=password,
                display_name=user_data["name"],
            )
            uid = fb_user.uid
        except Exception:
            try:
                fb_user = auth_client.get_user_by_email(email)
                uid = fb_user.uid
            except Exception:
                continue

        users_ref.document(uid).set({
            "uid": uid,
            "email": email,
            "full_name": user_data["name"],
            "role": user_data["role"],
            "is_active": True,
            "created_at": datetime.now(timezone.utc),
        })
        seeded_count += 1

    print(f"Default user seeding complete. Created {seeded_count} account(s).")
