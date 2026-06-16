"""
InfecSure - Authentication Router

POST /auth/login accepts a JSON body:
{
  "email": "icno@infecsure.com",
  "password": "your-firebase-password"
}
"""

from __future__ import annotations

from fastapi import APIRouter, Body, Depends, HTTPException, status
from jose import JWTError

from app.dependencies import get_current_user
from app.models.auth import LoginRequest, RefreshRequest, TokenData, TokenResponse
from app.services import auth_service, fallback_data, firebase_service as fs

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Login with Firebase email and password",
)
async def login(
    body: LoginRequest = Body(
        ...,
        examples={
            "icno": {
                "summary": "ICNO login",
                "value": {
                    "email": "icno@infecsure.com",
                    "password": "your-firebase-password",
                },
            }
        },
    )
):
    """
    Verify the submitted email/password with Firebase Authentication, then
    load the user's InfecSure RBAC role from Firestore.
    """
    email = body.email.lower().strip()
    password = body.password

    try:
        firebase_payload = await auth_service.firebase_sign_in(email, password)
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        )
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )

    uid = firebase_payload.get("localId")
    if not uid:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Firebase sign-in response did not include localId.",
        )

    try:
        user_doc = fs.get_user_by_uid(uid) or fs.get_user_by_email(email)
    except Exception as exc:
        if fallback_data.is_quota_error(exc) and email in fallback_data.ROLE_BY_EMAIL:
            return auth_service.build_token_response(
                uid=uid,
                email=email,
                role=fallback_data.ROLE_BY_EMAIL[email],
            )
        raise
    if not user_doc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                f"No Firestore users/{uid} profile or users email profile exists "
                "for this Firebase account."
            ),
        )

    if user_doc.get("is_active") is False:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive. Contact system administrator.",
        )

    profile_email = str(user_doc.get("email", "")).lower().strip()
    if profile_email and profile_email != email:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Firebase email does not match the Firestore user profile.",
        )

    role = auth_service.role_from_authenticated_user(user_doc, uid)
    if role is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User profile has no valid InfecSure RBAC role.",
        )

    return auth_service.build_token_response(uid=uid, email=email, role=role)


@router.post("/refresh", response_model=TokenResponse, summary="Refresh access token")
async def refresh_token(body: RefreshRequest):
    """Exchange a valid refresh token for a new access token."""
    try:
        token_data = auth_service.decode_token(body.refresh_token)
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token.",
        )
    return auth_service.build_token_response(
        token_data.uid,
        token_data.email,
        token_data.role,
    )


@router.get("/me", summary="Get current user profile")
async def get_me(current_user: TokenData = Depends(get_current_user)):
    """Return the authenticated user's Firestore profile when available."""
    try:
        user_doc = fs.get_user_by_uid(current_user.uid) or fs.get_user_by_email(current_user.email)
    except Exception as exc:
        if fallback_data.is_quota_error(exc):
            return {
                "uid": current_user.uid,
                "email": current_user.email,
                "role": current_user.role,
                "full_name": current_user.email,
                "is_active": True,
                "fallback": True,
            }
        raise
    if user_doc:
        return user_doc
    return {
        "uid": current_user.uid,
        "email": current_user.email,
        "role": current_user.role,
    }
