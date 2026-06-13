"""
InfecSure — Authentication Service
====================================
Handles:
  - Firebase Auth email/password sign-in via REST API
  - JWT access + refresh token creation and verification
  - User credential seeding (first-run)
"""

from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx
from jose import JWTError, jwt

from app.config import get_settings, db, auth_client
from app.models.auth import TokenData, TokenResponse
from app.models.user import UserRole

settings = get_settings()

# ─── Credential map (email → role) ───────────────────────────────────────────
ROLE_MAP: dict[str, UserRole] = {
    "icno@infecsure.com":    UserRole.ICNO,
    "matron@infecsure.com":  UserRole.SISTER,
    "lab@infecsure.com":     UserRole.LAB,
    "doctor@infecsure.com":  UserRole.DOCTOR,
    "staff@infecsure.com":   UserRole.STAFF,
}

FIREBASE_WEB_API_KEY = os.environ.get("FIREBASE_WEB_API_KEY", "")


# ─── Token Helpers ────────────────────────────────────────────────────────────

def _create_token(data: dict, expires_delta: timedelta) -> str:
    payload = data.copy()
    expire = datetime.now(timezone.utc) + expires_delta
    payload.update({"exp": expire, "iat": datetime.now(timezone.utc)})
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
    """Decode and validate a JWT.  Raises JWTError on failure."""
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


# ─── Firebase Sign-In via REST ────────────────────────────────────────────────

async def firebase_sign_in(email: str, password: str) -> dict:
    """
    Sign in a user via Firebase Auth REST endpoint.
    Returns the Firebase user payload on success.
    """
    url = (
        f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword"
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


# ─── Admin SDK Sign-In (no Web API key needed) ────────────────────────────────

def admin_verify_user(email: str) -> Optional[dict]:
    """Look up a Firebase user by email using Admin SDK."""
    try:
        user = auth_client.get_user_by_email(email)
        return {"uid": user.uid, "email": user.email, "display_name": user.display_name}
    except Exception:
        return None


def get_role_for_email(email: str) -> Optional[str]:
    """Return the static role assignment for a known email."""
    role = ROLE_MAP.get(email.lower())
    return role.value if role else None


# ─── Build Token Response ─────────────────────────────────────────────────────

def build_token_response(uid: str, email: str, role: str) -> TokenResponse:
    return TokenResponse(
        access_token=create_access_token(uid, email, role),
        refresh_token=create_refresh_token(uid, email, role),
        role=role,
        uid=uid,
    )


# ─── Seed Default Users (call once on startup) ────────────────────────────────

DEFAULT_USERS = [
    {"email": "icno@infecsure.com",    "password": "icnoPassword123",    "name": "ICNO Officer",       "role": UserRole.ICNO},
    {"email": "matron@infecsure.com",  "password": "matronPassword123",  "name": "Acting Matron",      "role": UserRole.SISTER},
    {"email": "lab@infecsure.com",     "password": "labPassword123",     "name": "Lab Personnel",      "role": UserRole.LAB},
    {"email": "doctor@infecsure.com",  "password": "doctorPassword123",  "name": "Supervising Doctor", "role": UserRole.DOCTOR},
    {"email": "staff@infecsure.com",   "password": "staffPassword123",   "name": "Hospital Staff",     "role": UserRole.STAFF},
]


async def seed_default_users() -> None:
    """
    Idempotently create the five default system accounts in Firebase Auth
    and store their profiles in Firestore `users` collection.
    """
    users_ref = db.collection("users")
    for user_data in DEFAULT_USERS:
        email = user_data["email"]
        # Check if already exists in Firestore
        existing = users_ref.where("email", "==", email).limit(1).get()
        if existing:
            continue
        # Create in Firebase Auth
        try:
            fb_user = auth_client.create_user(
                email=email,
                password=user_data["password"],
                display_name=user_data["name"],
            )
            uid = fb_user.uid
        except Exception:
            # User might already exist in Auth — fetch uid
            try:
                fb_user = auth_client.get_user_by_email(email)
                uid = fb_user.uid
            except Exception:
                continue

        # Persist profile to Firestore
        users_ref.document(uid).set({
            "uid": uid,
            "email": email,
            "full_name": user_data["name"],
            "role": user_data["role"].value,
            "is_active": True,
            "created_at": datetime.now(timezone.utc),
        })
    print("✅  Default users seeded successfully.")
