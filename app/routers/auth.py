"""
InfecSure — Auth Router
========================
POST /auth/login       → email/password → JWT tokens
POST /auth/refresh     → refresh_token → new access token
GET  /auth/me          → current user profile
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.dependencies import get_current_user
from app.models.auth import LoginRequest, RefreshRequest, TokenData, TokenResponse
from app.services import auth_service, firebase_service as fs
from jose import JWTError

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/login", response_model=TokenResponse, summary="Login with email and password")
async def login(body: LoginRequest):
    """
    Authenticate a user with their email and password.
    Returns JWT access + refresh tokens with role information.

    - **ICNO**: icno@infecsure.com / icnoPassword123
    - **Sister**: matron@infecsure.com / matronPassword123
    - **Lab**: lab@infecsure.com / labPassword123
    - **Doctor**: doctor@infecsure.com / doctorPassword123
    - **Staff**: staff@infecsure.com / staffPassword123
    """
    email = body.email.lower().strip()
    password = body.password

    # Determine role from static role map
    role = auth_service.get_role_for_email(email)
    if role is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email not recognized as an InfecSure system user.",
        )

    # Look up user in Firestore
    user_doc = fs.get_user_by_email(email)

    # Verify via Firebase Auth Admin SDK
    fb_user = auth_service.admin_verify_user(email)
    if fb_user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account not found. Contact system administrator.",
        )

    # For password verification, we use a simple in-memory check
    # (In production, use Firebase REST API with Web API key or custom auth)
    KNOWN_PASSWORDS = {
        "icno@infecsure.com":    "icnoPassword123",
        "matron@infecsure.com":  "matronPassword123",
        "lab@infecsure.com":     "labPassword123",
        "doctor@infecsure.com":  "doctorPassword123",
        "staff@infecsure.com":   "staffPassword123",
    }

    if KNOWN_PASSWORDS.get(email) != password:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid password.",
        )

    uid = fb_user["uid"]
    return auth_service.build_token_response(uid, email, role)


@router.post("/refresh", response_model=TokenResponse, summary="Refresh access token")
async def refresh_token(body: RefreshRequest):
    """
    Exchange a valid refresh token for a new access token.
    """
    try:
        token_data = auth_service.decode_token(body.refresh_token)
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token.",
        )
    return auth_service.build_token_response(
        token_data.uid, token_data.email, token_data.role
    )


@router.get("/me", summary="Get current user profile")
async def get_me(current_user: TokenData = Depends(get_current_user)):
    """Returns the decoded token payload of the currently authenticated user."""
    user_doc = fs.get_user_by_uid(current_user.uid)
    if user_doc:
        return user_doc
    return {
        "uid": current_user.uid,
        "email": current_user.email,
        "role": current_user.role,
    }
