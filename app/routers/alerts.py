"""
InfecSure — Alerts Router (ICNO Validation Gate)
==================================================
GET  /alerts/                     → list alerts (filtered by status, role)
GET  /alerts/{alert_id}           → get specific alert
POST /alerts/validate/{alert_id}  → ICNO approves alert (publishes to others)
POST /alerts/reject/{alert_id}    → ICNO rejects alert (suppresses)
POST /alerts/dispatch/{alert_id}  → Dispatch MoH email for approved alert (ICNO only)
GET  /alerts/analytics/root-cause → Apriori root cause associations (ICNO only)
GET  /alerts/analytics/dashboard  → Dashboard summary stats (ICNO / Sister)
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.dependencies import get_current_user, require_role
from app.models.alert import Alert, DoctorInstructionRequest, RejectAlertRequest, ValidateAlertRequest
from app.models.auth import TokenData
from app.models.user import UserRole
from app.services import email_service, firebase_service as fs, ml_service

router = APIRouter(prefix="/alerts", tags=["Alerts & Validation Gate"])

_ALL_AUTH = Depends(get_current_user)
_ICNO_ONLY = Depends(require_role(UserRole.ICNO))
_ICNO_OR_SISTER = Depends(require_role(UserRole.ICNO, UserRole.SISTER))
_DOCTOR_ONLY = Depends(require_role(UserRole.DOCTOR))
_ICNO_SISTER_DOCTOR = Depends(require_role(UserRole.ICNO, UserRole.SISTER, UserRole.DOCTOR))


@router.get("/", summary="List alerts")
async def list_alerts(
    alert_status: str = None,
    current_user: TokenData = _ALL_AUTH,
):
    """
    Returns alerts based on the caller's role:
    - **ICNO**: All alerts (any status)
    - **Sister**: Approved alerts only
    - **Doctor**: Approved alerts targeting doctors
    - **Staff**: Not accessible (403)
    - **Lab**: Not accessible (403)
    """
    role = current_user.role

    if role == UserRole.STAFF.value:
        raise HTTPException(status_code=403, detail="Staff cannot access alerts.")
    if role == UserRole.LAB.value:
        raise HTTPException(status_code=403, detail="Lab staff cannot access alerts.")

    if role == UserRole.ICNO.value:
        # ICNO sees everything, can filter by status
        alerts = fs.list_alerts(status=alert_status)
    elif role == UserRole.SISTER.value:
        # Sister sees only approved
        alerts = fs.list_alerts(status="approved")
    elif role == UserRole.DOCTOR.value:
        # Doctor sees approved alerts targeting them
        alerts = fs.list_alerts(status="approved")
        alerts = [
            a for a in alerts
            if "doctor" in a.get("target_roles", []) or "icno" not in a.get("target_roles", [])
        ]
    else:
        alerts = []

    return alerts


@router.get("/pending", summary="List pending alerts for ICNO validation")
async def list_pending_alerts(_: TokenData = _ICNO_ONLY):
    return fs.list_alerts(status="pending", limit=200)


@router.get("/analytics/dashboard", summary="Dashboard summary (ICNO / Sister)")
async def get_dashboard(_: TokenData = _ICNO_OR_SISTER):
    """Returns aggregate hospital statistics for the ICNO/Matron dashboard."""
    return ml_service.get_dashboard_summary()


@router.get("/analytics/root-cause", summary="Apriori Root Cause Analysis (ICNO only)")
async def get_root_cause(
    min_support: float = 0.1,
    min_confidence: float = 0.5,
    min_lift: float = 1.0,
    max_rules: int = 25,
    _: TokenData = _ICNO_ONLY,
):
    """
    Run the Apriori algorithm to mine association rules between
    audit failures and pathogen detections.
    Returns sorted association rules with human-readable interpretations.
    """
    return ml_service.find_root_cause_associations(min_support, min_confidence, min_lift, max_rules)


@router.get("/management-instructions", summary="List doctor management instructions")
async def list_management_instructions(
    alert_id: str = None,
    _: TokenData = _ICNO_SISTER_DOCTOR,
):
    return fs.list_management_instructions(alert_id=alert_id)


@router.get("/{alert_id}", summary="Get specific alert")
async def get_alert(alert_id: str, current_user: TokenData = _ALL_AUTH):
    alert = fs.get_alert(alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found.")
    # Staff & Lab cannot view alerts
    if current_user.role in (UserRole.STAFF.value, UserRole.LAB.value):
        raise HTTPException(status_code=403, detail="Access denied.")
    return alert


@router.post("/validate/{alert_id}", summary="ICNO validates (approves) an alert")
async def validate_alert(
    alert_id: str,
    body: ValidateAlertRequest,
    current_user: TokenData = _ICNO_ONLY,
):
    """
    ICNO Validation Gate: approves a PENDING alert, making it visible to
    the appropriate roles (Sister, Doctor) based on target_roles.
    """
    alert = fs.get_alert(alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found.")
    if alert.get("status") != "pending":
        raise HTTPException(
            status_code=400,
            detail=f"Alert is already '{alert['status']}' — cannot validate.",
        )
    fs.validate_alert(alert_id, current_user.uid, body.icno_notes)
    return {"alert_id": alert_id, "status": "approved", "message": "Alert approved and published."}


@router.post("/reject/{alert_id}", summary="ICNO rejects an alert")
async def reject_alert(
    alert_id: str,
    body: RejectAlertRequest,
    current_user: TokenData = _ICNO_ONLY,
):
    """
    ICNO rejects (dismisses) a PENDING alert — it will not be shown to other users.
    """
    alert = fs.get_alert(alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found.")
    if alert.get("status") != "pending":
        raise HTTPException(
            status_code=400,
            detail=f"Alert is already '{alert['status']}' — cannot reject.",
        )
    fs.reject_alert(alert_id, current_user.uid, body.icno_notes)
    return {"alert_id": alert_id, "status": "rejected", "message": "Alert rejected."}


@router.post("/{alert_id}/doctor-acknowledge", summary="Doctor acknowledges finding and issues instructions")
@router.post("/{alert_id}/acknowledge", summary="Doctor digitally signs off on an alert")
@router.post("/{alert_id}/instructions", summary="Doctor appends clinical management instructions")
async def doctor_acknowledge_alert(
    alert_id: str,
    body: DoctorInstructionRequest,
    current_user: TokenData = _DOCTOR_ONLY,
):
    """
    Supervising Doctor response channel for ICNO-approved clinical findings.
    Stores acknowledgement and digital management instructions on the alert.
    """
    alert = fs.get_alert(alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found.")
    if alert.get("status") not in {"approved", "dispatched"}:
        raise HTTPException(
            status_code=400,
            detail="Doctor can acknowledge only ICNO-approved or dispatched alerts.",
        )
    if "doctor" not in alert.get("target_roles", []):
        raise HTTPException(status_code=403, detail="This alert is not assigned to doctors.")

    user_doc = fs.get_user_by_uid(current_user.uid)
    doctor_name = user_doc.get("full_name", current_user.email) if user_doc else current_user.email

    instruction_id = fs.acknowledge_alert_with_instructions(
        alert_id=alert_id,
        doctor_uid=current_user.uid,
        doctor_name=doctor_name,
        acknowledgement_notes=body.acknowledgement_notes,
        management_instructions=body.management_instructions,
        follow_up_required=body.follow_up_required,
    )

    return {
        "alert_id": alert_id,
        "instruction_id": instruction_id,
        "status": "acknowledged",
        "message": "Clinical finding acknowledged and management instructions saved.",
    }


@router.post("/dispatch/{alert_id}", summary="Dispatch MoH notification email (ICNO only)")
async def dispatch_alert(alert_id: str, to_email: str, _: TokenData = _ICNO_ONLY):
    """
    Send an authorized MoH notification email for a validated alert.
    Only allowed after ICNO approval (status == 'approved').
    """
    alert = fs.get_alert(alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found.")
    if alert.get("status") != "approved":
        raise HTTPException(
            status_code=400,
            detail="Only approved alerts can be dispatched. Please validate first.",
        )

    subject = f"[InfecSure] MoH Notification — {alert.get('title', 'Alert')}"
    body_html = email_service.build_moh_notification_body(alert)
    if not email_service.smtp_is_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="SMTP credentials are not configured. Set SMTP_USER and SMTP_PASSWORD before dispatching MoH notifications.",
        )

    sent = email_service.send_moh_notification(to_email, subject, body_html)

    if sent:
        fs.update_document("alerts", alert_id, {"status": "dispatched"})
        return {"message": f"Notification dispatched to {to_email}.", "status": "dispatched"}
    raise HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail="Email dispatch failed. Alert remains approved.",
    )
