"""
InfecSure — Lab Results Router
================================
POST /lab-results/            → enter lab result (Lab role only) → triggers Z-Score
GET  /lab-results/            → list all lab results
GET  /lab-results/{result_id} → get specific result
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.dependencies import get_current_user, require_role
from app.models.auth import TokenData
from app.models.lab import LabResult, LabResultCreate, LabResultPublic
from app.models.user import UserRole
from app.services import firebase_service as fs
from app.services import ml_service

router = APIRouter(prefix="/lab-results", tags=["Laboratory Results"])

_ALL_AUTH = Depends(get_current_user)
_LAB_OR_ICNO = Depends(require_role(UserRole.LAB, UserRole.ICNO))


@router.post("/", status_code=status.HTTP_201_CREATED, summary="Enter lab result (Lab / ICNO)")
async def create_lab_result(
    body: LabResultCreate,
    current_user: TokenData = _LAB_OR_ICNO,
):
    """
    Record a new microbiology test result.
    Automatically triggers Z-Score anomaly detection on submission.
    If an anomaly is detected, a PENDING alert is created for ICNO review.
    """
    # Verify ward exists
    ward = fs.get_ward(body.ward_id)
    if not ward:
        raise HTTPException(status_code=404, detail="Ward not found.")

    # Verify pathogen exists
    pathogen = fs.get_pathogen(body.pathogen_id)
    if not pathogen:
        raise HTTPException(status_code=404, detail="Pathogen not found.")

    # Get submitting user's name
    user_doc = fs.get_user_by_uid(current_user.uid)
    user_name = user_doc.get("full_name", current_user.email) if user_doc else current_user.email

    # Run Z-Score anomaly detection
    colony_count = body.colony_count or 1
    anomaly = ml_service.detect_anomaly(body.pathogen_id, colony_count)

    # Prepare data
    data = body.model_dump()
    data["result_date"] = body.result_date.isoformat()
    data["entered_by_uid"] = current_user.uid
    data["entered_by_name"] = user_name
    data["anomaly"] = anomaly

    result_id = fs.create_lab_result(data)

    # Create PENDING alert if anomaly detected
    if anomaly["is_anomaly"]:
        fs.create_alert({
            "alert_type": "anomaly",
            "ward_id": body.ward_id,
            "title": f"Pathogen Anomaly — {body.pathogen_name} in {ward.get('name', body.ward_id)}",
            "description": anomaly["message"],
            "severity": anomaly["severity"] or "warning",
            "source_data": {
                "result_id": result_id,
                "pathogen_id": body.pathogen_id,
                "pathogen_name": body.pathogen_name,
                "z_score": anomaly["z_score"],
                "colony_count": colony_count,
            },
            "target_roles": ["icno", "doctor"],
        })

    return {
        "result_id": result_id,
        "anomaly": anomaly,
        "message": "Lab result recorded. Anomaly detection complete.",
    }


@router.get("/", summary="List all lab results")
async def list_lab_results(
    ward_id: str = None,
    current_user: TokenData = _ALL_AUTH,
):
    """
    Returns all lab results.
    Staff role receives masked data (no patient identifiers).
    """
    results = fs.list_lab_results(ward_id=ward_id)
    if current_user.role == UserRole.STAFF.value:
        masked = []
        for r in results:
            masked.append({
                "result_id": r["result_id"],
                "ward_id": r["ward_id"],
                "pathogen_name": r["pathogen_name"],
                "specimen_type": r.get("specimen_type"),
                "result_date": r.get("result_date"),
                "anomaly": r.get("anomaly"),
                "created_at": r.get("created_at"),
            })
        return masked
    return results


@router.get("/{result_id}", summary="Get specific lab result")
async def get_lab_result(result_id: str, current_user: TokenData = _ALL_AUTH):
    result = fs.get_lab_result(result_id)
    if not result:
        raise HTTPException(status_code=404, detail="Lab result not found.")
    # Mask for staff
    if current_user.role == UserRole.STAFF.value:
        result.pop("patient_ward_location", None)
        result.pop("entered_by_uid", None)
        result.pop("resistance_profile", None)
        result.pop("antibiotic_sensitivity", None)
    return result
