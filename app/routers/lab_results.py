"""
InfecSure - Lab Results Router
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.dependencies import get_current_user, require_role
from app.models.auth import TokenData
from app.models.lab import LabResultCreate
from app.models.user import UserRole
from app.services import domain_service, fallback_data, firebase_service as fs

router = APIRouter(prefix="/lab-results", tags=["Laboratory Results"])

_ALL_AUTH = Depends(get_current_user)
_LAB_OR_ICNO = Depends(require_role(UserRole.LAB, UserRole.ICNO))


@router.post("/", status_code=status.HTTP_201_CREATED, summary="Enter lab result (Lab / ICNO)")
async def create_lab_result(
    body: LabResultCreate,
    current_user: TokenData = _LAB_OR_ICNO,
):
    """
    Record a microbiology result, run Z-Score anomaly detection, update ward
    risk, and create alerts when needed.
    """
    try:
        return domain_service.create_lab_result(
            body,
            entered_by_uid=current_user.uid,
            entered_by_email=current_user.email,
        )
    except ValueError as exc:
        message = str(exc)
        status_code = 404 if "not found" in message.lower() else 400
        raise HTTPException(status_code=status_code, detail=message)


@router.get("/", summary="List all lab results")
async def list_lab_results(
    ward_id: str = None,
    current_user: TokenData = _ALL_AUTH,
):
    """
    Returns all lab results.
    Staff role receives masked data with no patient identifiers.
    """
    try:
        results = fs.list_lab_results(ward_id=ward_id)
    except Exception as exc:
        if fallback_data.is_quota_error(exc):
            results = [r for r in fallback_data.LAB_RESULTS if not ward_id or r.get("ward_id") == ward_id]
        else:
            raise
    if current_user.role == UserRole.STAFF.value:
        return [
            {
                "result_id": r.get("result_id") or r.get("_id"),
                "ward_id": r.get("ward_id"),
                "pathogen_name": r.get("pathogen_name"),
                "specimen_type": r.get("specimen_type"),
                "result_date": r.get("result_date"),
                "anomaly": r.get("anomaly"),
                "created_at": r.get("created_at"),
            }
            for r in results
        ]
    return results


@router.get("/{result_id}", summary="Get specific lab result")
async def get_lab_result(result_id: str, current_user: TokenData = _ALL_AUTH):
    result = fs.get_lab_result(result_id)
    if not result:
        raise HTTPException(status_code=404, detail="Lab result not found.")
    if current_user.role == UserRole.STAFF.value:
        result.pop("patient_ward_location", None)
        result.pop("entered_by_uid", None)
        result.pop("resistance_profile", None)
        result.pop("antibiotic_sensitivity", None)
    return result
