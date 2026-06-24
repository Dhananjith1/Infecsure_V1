"""
InfecSure - Laboratory Intelligence Router
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.dependencies import require_role
from app.models.auth import TokenData
from app.models.pathogen import PathogenCreate
from app.models.user import UserRole
from app.services import firebase_service as fs

router = APIRouter(prefix="/lab", tags=["Laboratory Intelligence"])

_LAB_ONLY = Depends(require_role(UserRole.LAB))
_LAB_OR_ICNO = Depends(require_role(UserRole.LAB, UserRole.ICNO))


@router.post("/pathogens", status_code=status.HTTP_201_CREATED, summary="Create pathogen (Lab only)")
async def create_lab_pathogen(body: PathogenCreate, _: TokenData = _LAB_ONLY):
    data = body.model_dump(mode="json")
    pathogen_id = fs.create_pathogen(data)
    return {"pathogen_id": pathogen_id, "message": "Pathogen created.", **data}


@router.get("/volume/48h", summary="Get 48-hour positive culture volume")
async def positive_culture_volume_48h(
    ward_id: str,
    pathogen_id: str = None,
    _: TokenData = _LAB_OR_ICNO,
):
    if not fs.get_ward(ward_id):
        raise HTTPException(status_code=404, detail="Ward not found.")
    if pathogen_id and not fs.get_pathogen(pathogen_id):
        raise HTTPException(status_code=404, detail="Pathogen not found.")
    return {
        "ward_id": ward_id,
        "pathogen_id": pathogen_id,
        "window_hours": 48,
        "positive_culture_count": fs.count_positive_cultures_48h(ward_id, pathogen_id),
    }
