"""
InfecSure - ICNO Validation Gate Router
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.dependencies import require_role
from app.models.auth import TokenData
from app.models.gate import GateValidationRequest
from app.models.user import UserRole
from app.services import firebase_service as fs

router = APIRouter(prefix="/gate", tags=["ICNO Validation Gate"])

_ICNO_ONLY = Depends(require_role(UserRole.ICNO))


@router.get("/pending", summary="Fetch all pending alerts requiring ICNO clearance")
async def pending_gate_items(_: TokenData = _ICNO_ONLY):
    return fs.list_alerts(status="pending", limit=200)


@router.post("/validate", summary="Approve or reject a pending alert")
async def validate_gate_item(
    body: GateValidationRequest,
    current_user: TokenData = _ICNO_ONLY,
):
    alert = fs.get_alert(body.alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found.")
    if alert.get("status") != "pending":
        raise HTTPException(status_code=400, detail=f"Alert is already '{alert.get('status')}'.")

    if body.decision == "approve":
        fs.validate_alert(body.alert_id, current_user.uid, body.icno_notes)
        return {
            "alert_id": body.alert_id,
            "status": "approved",
            "message": "Alert approved. Downstream heatmap/public notification gates may now use it.",
        }

    fs.reject_alert(body.alert_id, current_user.uid, body.icno_notes)
    return {
        "alert_id": body.alert_id,
        "status": "rejected",
        "message": "Alert rejected. Downstream publication remains blocked.",
    }
