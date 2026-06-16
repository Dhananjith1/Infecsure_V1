"""
InfecSure — Pathogens Router
==============================
GET  /pathogens/              → list all pathogens (all roles)
POST /pathogens/              → create pathogen (ICNO / Lab)
GET  /pathogens/{pathogen_id} → get pathogen details
PUT  /pathogens/{pathogen_id} → update (ICNO only)
DELETE /pathogens/{pathogen_id} → delete (ICNO only)
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.dependencies import get_current_user, require_role
from app.models.auth import TokenData
from app.models.pathogen import Pathogen, PathogenCreate
from app.models.user import UserRole
from app.services import fallback_data, firebase_service as fs

router = APIRouter(prefix="/pathogens", tags=["Pathogens"])

_ALL_AUTH = Depends(get_current_user)
_ICNO_ONLY = Depends(require_role(UserRole.ICNO))
_ICNO_OR_LAB = Depends(require_role(UserRole.ICNO, UserRole.LAB))


@router.get("/", summary="List all pathogens")
async def list_pathogens(_: TokenData = _ALL_AUTH):
    """Returns the pathogen catalogue accessible to all authenticated users."""
    try:
        return fs.list_pathogens()
    except Exception as exc:
        if fallback_data.is_quota_error(exc):
            return [
                {"pathogen_id": "dengue", "name": "Dengue", "category": "virus", "risk_level": "high"},
                {"pathogen_id": "mrsa", "name": "MRSA", "category": "bacteria", "risk_level": "high"},
                {"pathogen_id": "covid19", "name": "COVID-19", "category": "virus", "risk_level": "moderate"},
            ]
        raise


@router.post("/", status_code=status.HTTP_201_CREATED, summary="Create pathogen (ICNO / Lab)")
async def create_pathogen(body: PathogenCreate, _: TokenData = _ICNO_OR_LAB):
    """Add a new pathogen to the system catalogue."""
    data = body.model_dump()
    pathogen_id = fs.create_pathogen(data)
    return {"pathogen_id": pathogen_id, "message": "Pathogen created.", **data}


@router.get("/{pathogen_id}", summary="Get pathogen details")
async def get_pathogen(pathogen_id: str, _: TokenData = _ALL_AUTH):
    pathogen = fs.get_pathogen(pathogen_id)
    if not pathogen:
        raise HTTPException(status_code=404, detail="Pathogen not found.")
    return pathogen


@router.put("/{pathogen_id}", summary="Update pathogen (ICNO only)")
async def update_pathogen(pathogen_id: str, body: PathogenCreate, _: TokenData = _ICNO_ONLY):
    pathogen = fs.get_pathogen(pathogen_id)
    if not pathogen:
        raise HTTPException(status_code=404, detail="Pathogen not found.")
    fs.update_document("pathogens", pathogen_id, body.model_dump())
    return {"pathogen_id": pathogen_id, "message": "Pathogen updated."}


@router.delete("/{pathogen_id}", summary="Delete pathogen (ICNO only)")
async def delete_pathogen(pathogen_id: str, _: TokenData = _ICNO_ONLY):
    pathogen = fs.get_pathogen(pathogen_id)
    if not pathogen:
        raise HTTPException(status_code=404, detail="Pathogen not found.")
    fs.delete_document("pathogens", pathogen_id)
    return {"pathogen_id": pathogen_id, "message": "Pathogen deleted."}


@router.get("/{pathogen_id}/stats", summary="Get Z-Score stats for a pathogen")
async def get_pathogen_stats(pathogen_id: str, _: TokenData = _ALL_AUTH):
    """Returns rolling Z-Score statistics for a pathogen's frequency tracking."""
    stats = fs.get_pathogen_stats(pathogen_id)
    if not stats:
        raise HTTPException(status_code=404, detail="No statistics found for this pathogen.")
    return stats
