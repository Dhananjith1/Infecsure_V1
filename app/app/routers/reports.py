"""
InfecSure — Reports Router
============================
GET  /reports/                     → list generated reports (Sister / ICNO)
POST /reports/executive            → generate executive summary (Sister / ICNO)
POST /reports/dengue               → generate dengue alert PDF (ICNO / Doctor)
GET  /reports/download/{report_id} → download report file
"""

from __future__ import annotations

import os
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse

from app.dependencies import require_role
from app.models.auth import TokenData
from app.models.report import ReportFormat, ReportRequest, ReportType
from app.models.user import UserRole
from app.services import firebase_service as fs, report_service

router = APIRouter(prefix="/reports", tags=["Reports"])

REPORTS_DIR = Path("reports_output")
REPORTS_DIR.mkdir(exist_ok=True)

_ICNO_OR_SISTER = Depends(require_role(UserRole.ICNO, UserRole.SISTER))
_ICNO_OR_DOCTOR = Depends(require_role(UserRole.ICNO, UserRole.DOCTOR))
_ICNO_ONLY = Depends(require_role(UserRole.ICNO))


@router.get("/", summary="List generated reports (Sister / ICNO)")
async def list_reports(_: TokenData = _ICNO_OR_SISTER):
    """Returns metadata for all previously generated reports."""
    return fs.list_reports()


@router.post("/executive", status_code=status.HTTP_201_CREATED,
             summary="Generate executive summary report (Sister / ICNO)")
async def generate_executive(
    body: ReportRequest,
    current_user: TokenData = _ICNO_OR_SISTER,
):
    """
    Generate a PDF or Excel executive summary report including:
    - Ward risk overview table
    - Validated alerts summary
    - Lab results data
    """
    wards = fs.list_wards()
    alerts = fs.list_alerts(status="approved")
    lab_results = fs.list_lab_results(limit=500)

    user_doc = fs.get_user_by_uid(current_user.uid)
    user_name = user_doc.get("full_name", current_user.email) if user_doc else current_user.email

    report_id = f"exec_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}"
    filename = f"{report_id}.{body.format.value}"
    filepath = REPORTS_DIR / filename

    try:
        if body.format == ReportFormat.PDF:
            file_bytes = report_service.generate_executive_pdf(
                wards=wards,
                alerts=alerts,
                audit_summary=[],
                date_from=body.date_from,
                date_to=body.date_to,
                generated_by=user_name,
            )
        else:
            file_bytes = report_service.generate_executive_excel(
                wards=wards,
                alerts=alerts,
                lab_results=lab_results,
            )
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))

    filepath.write_bytes(file_bytes)

    # Save report metadata to Firestore
    fs.create_report_record({
        "report_id": report_id,
        "report_type": body.report_type.value,
        "format": body.format.value,
        "download_url": f"/reports/download/{report_id}",
        "file_size_bytes": len(file_bytes),
        "generated_at": datetime.now(timezone.utc),
        "generated_by_uid": current_user.uid,
        "filename": filename,
    })

    return {
        "report_id": report_id,
        "format": body.format.value,
        "download_url": f"/reports/download/{report_id}",
        "file_size_bytes": len(file_bytes),
        "message": "Report generated successfully.",
    }


@router.post("/dengue", status_code=status.HTTP_201_CREATED,
             summary="Generate dengue alert PDF (ICNO / Doctor)")
async def generate_dengue_report(
    alert_id: str,
    current_user: TokenData = _ICNO_OR_DOCTOR,
):
    """
    Generate a formatted Dengue Alert Report PDF for the Supervising Doctor.
    Links the alert to related lab results.
    """
    alert = fs.get_alert(alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found.")
    if alert.get("status") != "approved":
        raise HTTPException(status_code=400, detail="Only approved alerts can generate dengue reports.")

    # Find related lab results by ward
    ward_id = alert.get("ward_id")
    lab_results = fs.list_lab_results(ward_id=ward_id, limit=50) if ward_id else []

    user_doc = fs.get_user_by_uid(current_user.uid)
    user_name = user_doc.get("full_name", current_user.email) if user_doc else current_user.email

    try:
        file_bytes = report_service.generate_dengue_pdf(alert, lab_results, user_name)
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))

    report_id = f"dengue_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}"
    filename = f"{report_id}.pdf"
    filepath = REPORTS_DIR / filename
    filepath.write_bytes(file_bytes)

    fs.create_report_record({
        "report_id": report_id,
        "report_type": "dengue_alert",
        "format": "pdf",
        "download_url": f"/reports/download/{report_id}",
        "file_size_bytes": len(file_bytes),
        "generated_at": datetime.now(timezone.utc),
        "generated_by_uid": current_user.uid,
        "linked_alert_id": alert_id,
        "filename": filename,
    })

    # Notify doctor by email if ICNO triggers this
    doctor_doc = fs.list_collection("users", filters=[("role", "==", "doctor")], limit=1)
    if doctor_doc and current_user.role == UserRole.ICNO.value:
        from app.services import email_service
        email_service.send_dengue_report_notification(doctor_doc[0]["email"], alert)

    return {
        "report_id": report_id,
        "download_url": f"/reports/download/{report_id}",
        "file_size_bytes": len(file_bytes),
        "message": "Dengue report generated and doctor notified.",
    }


@router.get("/download/{report_id}", summary="Download report file")
async def download_report(report_id: str, _: TokenData = _ICNO_OR_SISTER):
    """Download a previously generated PDF or Excel report file."""
    record = fs.get_report_record(report_id)
    if not record:
        raise HTTPException(status_code=404, detail="Report not found.")

    filename = record.get("filename")
    filepath = REPORTS_DIR / filename
    if not filepath.exists():
        raise HTTPException(status_code=404, detail="Report file not found on server.")

    media_type = (
        "application/pdf"
        if filename.endswith(".pdf")
        else "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    return FileResponse(path=str(filepath), filename=filename, media_type=media_type)
