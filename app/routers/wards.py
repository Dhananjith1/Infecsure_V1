"""
InfecSure — Wards Router
=========================
GET    /wards/           → list all wards (all authenticated roles)
POST   /wards/           → create ward (ICNO only)
GET    /wards/{ward_id}  → get ward details
PUT    /wards/{ward_id}  → update ward (ICNO only)
DELETE /wards/{ward_id}  → delete ward (ICNO only)
POST   /wards/{ward_id}/predict → trigger outbreak risk prediction
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.dependencies import get_current_user, require_role
from app.models.auth import TokenData
from app.models.user import UserRole
from app.models.ward import Ward, WardCreate
from app.services import firebase_service as fs
from app.services import ml_service

router = APIRouter(prefix="/wards", tags=["Wards"])

_ALL_AUTH = Depends(get_current_user)
_ICNO_ONLY = Depends(require_role(UserRole.ICNO))


@router.get("/", summary="List all wards")
async def list_wards(_: TokenData = _ALL_AUTH):
    """Returns all registered hospital wards."""
    return fs.list_wards()


@router.post("/", status_code=status.HTTP_201_CREATED, summary="Create ward (ICNO only)")
async def create_ward(body: WardCreate, _: TokenData = _ICNO_ONLY):
    """Register a new hospital ward in the system."""
    data = body.model_dump(mode="json")
    ward_id = fs.create_ward(data)
    return {"ward_id": ward_id, "message": "Ward created successfully.", **data}


@router.get("/{ward_id}", summary="Get ward details")
async def get_ward(ward_id: str, _: TokenData = _ALL_AUTH):
    ward = fs.get_ward(ward_id)
    if not ward:
        raise HTTPException(status_code=404, detail="Ward not found.")
    return ward


@router.put("/{ward_id}", summary="Update ward (ICNO only)")
async def update_ward(ward_id: str, body: WardCreate, _: TokenData = _ICNO_ONLY):
    ward = fs.get_ward(ward_id)
    if not ward:
        raise HTTPException(status_code=404, detail="Ward not found.")
    fs.update_document("wards", ward_id, body.model_dump(mode="json"))
    return {"ward_id": ward_id, "message": "Ward updated successfully."}


@router.delete("/{ward_id}", summary="Delete ward (ICNO only)")
async def delete_ward(ward_id: str, _: TokenData = _ICNO_ONLY):
    ward = fs.get_ward(ward_id)
    if not ward:
        raise HTTPException(status_code=404, detail="Ward not found.")
    fs.delete_document("wards", ward_id)
    return {"ward_id": ward_id, "message": "Ward deleted."}


@router.post("/{ward_id}/predict", summary="Trigger outbreak risk prediction for a ward (ICNO only)")
async def predict_ward_risk(ward_id: str, _: TokenData = _ICNO_ONLY):
    """
    Run the Random Forest Classifier to compute the outbreak risk score
    for the specified ward. Creates a PENDING alert if risk is High/Critical.
    """
    ward = fs.get_ward(ward_id)
    if not ward:
        raise HTTPException(status_code=404, detail="Ward not found.")
    result = ml_service.predict_outbreak_risk(ward_id)
    return result


@router.get("/{ward_id}/audits", summary="Get all audits for a ward")
async def get_ward_audits(ward_id: str, _: TokenData = _ALL_AUTH):
    """Returns all ward audit records for a specific ward."""
    return fs.list_audits_for_ward(ward_id)


@router.get("/{ward_id}/lab-results", summary="Get lab results for a ward")
async def get_ward_lab_results(ward_id: str, current_user: TokenData = Depends(get_current_user)):
    """Returns lab results for a ward. Staff role sees masked data."""
    results = fs.list_lab_results(ward_id=ward_id)
    if current_user.role == UserRole.LAB.value:
        results = [r for r in results if r.get("entered_by_uid") == current_user.uid]
    if current_user.role == UserRole.STAFF.value:
        # Mask patient identifiers
        for r in results:
            r.pop("patient_ward_location", None)
            r.pop("entered_by_uid", None)
            r.pop("resistance_profile", None)
            r.pop("antibiotic_sensitivity", None)
    return results
