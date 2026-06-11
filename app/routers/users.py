"""
InfecSure — Users Router
=========================
ICNO-only user management.

GET    /users/          → list all users
POST   /users/          → create a new user
GET    /users/{uid}     → get user by UID
PUT    /users/{uid}     → update user
DELETE /users/{uid}     → deactivate user
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.dependencies import get_current_user, require_role
from app.models.auth import TokenData
from app.models.user import (
    CreateUserRequest, UpdateUserRequest, UserProfile, UserPublicProfile, UserRole,
)
from app.services import auth_service, firebase_service as fs

router = APIRouter(prefix="/users", tags=["Users"])

_ICNO_ONLY = Depends(require_role(UserRole.ICNO))


@router.get("/", summary="List all users (ICNO only)")
async def list_users(_: TokenData = _ICNO_ONLY):
    """Returns all registered InfecSure users."""
    return fs.list_users()


@router.post("/", status_code=status.HTTP_201_CREATED, summary="Create a new user (ICNO only)")
async def create_user(body: CreateUserRequest, _: TokenData = _ICNO_ONLY):
    """
    Create a new user in Firebase Auth and register their profile in Firestore.
    """
    from app.config import auth_client
    from datetime import datetime, timezone

    # Create Firebase Auth account
    try:
        fb_user = auth_client.create_user(
            email=body.email,
            password=body.password,
            display_name=body.full_name,
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Firebase Auth error: {str(e)}",
        )

    # Save profile to Firestore
    profile = {
        "uid": fb_user.uid,
        "email": body.email,
        "full_name": body.full_name,
        "role": body.role.value,
        "is_active": True,
    }
    fs.db.collection("users").document(fb_user.uid).set({
        **profile,
        "created_at": datetime.now(timezone.utc),
    })

    return {"uid": fb_user.uid, "message": "User created successfully.", **profile}


@router.get("/{uid}", summary="Get user by UID (ICNO only)")
async def get_user(uid: str, _: TokenData = _ICNO_ONLY):
    user = fs.get_user_by_uid(uid)
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    return user


@router.put("/{uid}", summary="Update user (ICNO only)")
async def update_user(uid: str, body: UpdateUserRequest, _: TokenData = _ICNO_ONLY):
    user = fs.get_user_by_uid(uid)
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    update_data = body.model_dump(exclude_none=True)
    if "role" in update_data:
        update_data["role"] = update_data["role"].value
    fs.update_document("users", uid, update_data)
    return {"uid": uid, "message": "User updated successfully.", **update_data}


@router.delete("/{uid}", summary="Deactivate user (ICNO only)")
async def deactivate_user(uid: str, _: TokenData = _ICNO_ONLY):
    user = fs.get_user_by_uid(uid)
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    fs.update_document("users", uid, {"is_active": False})
    return {"uid": uid, "message": "User deactivated."}
