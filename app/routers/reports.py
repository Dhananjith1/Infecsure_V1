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
from app.services import fallback_data, firebase_service as fs, report_service

router = APIRouter(prefix="/reports", tags=["Reports"])

REPORTS_DIR = Path("reports_output")
REPORTS_DIR.mkdir(exist_ok=True)

_ICNO_OR_SISTER = Depends(require_role(UserRole.ICNO, UserRole.SISTER))
_ICNO_OR_DOCTOR = Depends(require_role(UserRole.ICNO, UserRole.DOCTOR))
_ICNO_ONLY = Depends(require_role(UserRole.ICNO))


def _safe_list_wards() -> list[dict]:
    try:
        return fs.list_wards()
    except Exception as exc:
        if fallback_data.is_quota_error(exc):
            return fallback_data.WARDS
        raise


def _safe_list_alerts(status: str | None = None) -> list[dict]:
    try:
        return fs.list_alerts(status=status)
    except Exception as exc:
        if fallback_data.is_quota_error(exc):
            return [item for item in fallback_data.ALERTS if not status or item.get("status") == status]
        raise


def _safe_list_lab_results(ward_id: str | None = None, limit: int = 500) -> list[dict]:
    try:
        return fs.list_lab_results(ward_id=ward_id, limit=limit)
    except Exception as exc:
        if fallback_data.is_quota_error(exc):
            return [
                item for item in fallback_data.LAB_RESULTS
                if not ward_id or item.get("ward_id") == ward_id
            ][:limit]
        raise


def _safe_user_name(current_user: TokenData) -> str:
    try:
        user_doc = fs.get_user_by_uid(current_user.uid)
    except Exception as exc:
        if not fallback_data.is_quota_error(exc):
            raise
        user_doc = None
    return user_doc.get("full_name", current_user.email) if user_doc else current_user.email


def _safe_create_report_record(data: dict) -> None:
    try:
        fs.create_report_record(data)
    except Exception as exc:
        if not fallback_data.is_quota_error(exc):
            raise


def _find_report_record(report_id: str) -> dict | None:
    try:
        record = fs.get_report_record(report_id)
    except Exception as exc:
        if not fallback_data.is_quota_error(exc):
            raise
        record = None
    if record:
        return record
    download_path = f"/reports/download/{report_id}"
    try:
        reports = fs.list_reports(limit=100)
    except Exception as exc:
        if not fallback_data.is_quota_error(exc):
            raise
        reports = []
    for item in reports:
        filename = str(item.get("filename") or "")
        if item.get("download_url") == download_path or filename.startswith(report_id):
            return item
    local_matches = list(REPORTS_DIR.glob(f"{report_id}.*"))
    if local_matches:
        filepath = local_matches[0]
        return {
            "report_id": report_id,
            "report_type": ReportType.EXECUTIVE_SUMMARY.value,
            "format": ReportFormat.PDF.value if filepath.suffix.lower() == ".pdf" else ReportFormat.EXCEL.value,
            "download_url": download_path,
            "filename": filepath.name,
        }
    return None


def _report_filepath(record: dict, report_id: str) -> Path:
    filename = record.get("filename")
    if not filename:
        extension = "pdf" if record.get("format") == ReportFormat.PDF.value else "xlsx"
        filename = f"{report_id}.{extension}"
        record["filename"] = filename
    return REPORTS_DIR / filename


def _regenerate_executive_file(record: dict, filepath: Path, current_user: TokenData) -> None:
    if record.get("report_type") not in {ReportType.EXECUTIVE_SUMMARY.value, "executive_summary"}:
        return

    wards = _safe_list_wards()
    alerts = _safe_list_alerts(status="approved")
    lab_results = _safe_list_lab_results(limit=500)
    user_name = _safe_user_name(current_user)

    if filepath.suffix.lower() == ".pdf":
        file_bytes = report_service.generate_executive_pdf(
            wards=wards,
            alerts=alerts,
            audit_summary=[],
            generated_by=user_name,
        )
    else:
        file_bytes = report_service.generate_executive_excel(
            wards=wards,
            alerts=alerts,
            lab_results=lab_results,
        )
    filepath.write_bytes(file_bytes)


@router.get("/", summary="List generated reports (Sister / ICNO)")
async def list_reports(_: TokenData = _ICNO_OR_SISTER):
    """Returns metadata for all previously generated reports."""
    try:
        return fs.list_reports()
    except Exception as exc:
        if fallback_data.is_quota_error(exc):
            return []
        raise


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
    wards = _safe_list_wards()
    alerts = _safe_list_alerts(status="approved")
    lab_results = _safe_list_lab_results(limit=500)

    user_name = _safe_user_name(current_user)

    report_id = f"exec_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}"
    extension = "pdf" if body.format == ReportFormat.PDF else "xlsx"
    filename = f"{report_id}.{extension}"
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

    # Save report metadata to Firestore when available. Local file download still
    # works if Firestore quota is temporarily exhausted.
    _safe_create_report_record({
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

    ward_id = alert.get("ward_id")
    lab_results = _safe_list_lab_results(ward_id=ward_id, limit=50) if ward_id else []
    user_name = _safe_user_name(current_user)

    try:
        file_bytes = report_service.generate_dengue_pdf(alert, lab_results, user_name)
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))

    report_id = f"dengue_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}"
    filename = f"{report_id}.pdf"
    filepath = REPORTS_DIR / filename
    filepath.write_bytes(file_bytes)

    _safe_create_report_record({
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
    try:
        doctor_doc = fs.list_collection("users", filters=[("role", "==", "doctor")], limit=1)
    except Exception as exc:
        if not fallback_data.is_quota_error(exc):
            raise
        doctor_doc = []
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
async def download_report(report_id: str, current_user: TokenData = _ICNO_OR_SISTER):
    """Download a previously generated PDF or Excel report file."""
    record = _find_report_record(report_id)
    if not record:
        raise HTTPException(status_code=404, detail="Report not found.")

    filepath = _report_filepath(record, report_id)
    if not filepath.exists():
        try:
            _regenerate_executive_file(record, filepath, current_user)
        except RuntimeError as exc:
            raise HTTPException(status_code=500, detail=str(exc))
        if not filepath.exists():
            raise HTTPException(status_code=404, detail="Report file not found on server.")

    filename = filepath.name

    media_type = (
        "application/pdf"
        if filename.endswith(".pdf")
        else "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    return FileResponse(path=str(filepath), filename=filename, media_type=media_type)
