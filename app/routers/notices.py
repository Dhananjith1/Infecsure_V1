"""
InfecSure — Notices Router
===========================
GET    /notices/         → list notices (all authenticated roles)
POST   /notices/         → create notice (ICNO / Sister)
DELETE /notices/{id}     → delete notice (ICNO only)
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.dependencies import get_current_user, require_role
from app.models.auth import TokenData
from app.models.notice import Notice, NoticeCreate
from app.models.user import UserRole
from app.services import firebase_service as fs

router = APIRouter(prefix="/notices", tags=["Common Notice Panel"])

_ALL_AUTH = Depends(get_current_user)
_ICNO_OR_SISTER = Depends(require_role(UserRole.ICNO, UserRole.SISTER))
_ICNO_ONLY = Depends(require_role(UserRole.ICNO))


@router.get("/", summary="List notices (all authenticated users)")
async def list_notices(_: TokenData = _ALL_AUTH):
    """
    Returns all active notices from the Common Notice Panel.
    Accessible to all authenticated users including Staff.
    Sensitive patient information is never present in notices.
    """
    notices = fs.list_notices()
    # Filter expired notices
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    active = []
    for n in notices:
        expires = n.get("expires_at")
        if expires:
            if isinstance(expires, str):
                from datetime import datetime as dt
                try:
                    expires = dt.fromisoformat(expires)
                except Exception:
                    expires = None
            if expires and expires < now:
                continue
        active.append(n)
    return active


@router.post("/", status_code=201, summary="Post a notice (ICNO / Sister)")
async def create_notice(body: NoticeCreate, current_user: TokenData = _ICNO_OR_SISTER):
    """Post a new notice to the Common Notice Panel."""
    user_doc = fs.get_user_by_uid(current_user.uid)
    user_name = user_doc.get("full_name", current_user.email) if user_doc else current_user.email

    data = body.model_dump()
    if data.get("expires_at"):
        data["expires_at"] = data["expires_at"].isoformat()
    data["posted_by_uid"] = current_user.uid
    data["posted_by_name"] = user_name

    notice_id = fs.create_notice(data)
    return {"notice_id": notice_id, "message": "Notice posted.", **data}


@router.delete("/{notice_id}", summary="Delete notice (ICNO only)")
async def delete_notice(notice_id: str, _: TokenData = _ICNO_ONLY):
    """Remove a notice from the Common Notice Panel."""
    fs.delete_notice(notice_id)
    return {"notice_id": notice_id, "message": "Notice deleted."}
