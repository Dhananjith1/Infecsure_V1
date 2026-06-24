"""
InfecSure domain workflows.

These helpers keep API submissions and OCR-confirmed records on the same
business path: validation, scoring, risk prediction, and alert generation.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from pydantic import ValidationError

from app.models.audit import AuditCreate
from app.models.lab import LabResultCreate
from app.models.ward import normalize_ward_name, ward_type_for_name
from app.services import firebase_service as fs
from app.services import ml_service


def _user_name(uid: str, fallback_email: str) -> str:
    user_doc = fs.get_user_by_uid(uid)
    return user_doc.get("full_name", fallback_email) if user_doc else fallback_email


def _resolve_ward_id(payload: dict[str, Any]) -> None:
    if payload.get("ward_id"):
        return
    ward_name = payload.get("ward_name") or payload.get("ward")
    if not ward_name:
        return
    normalized = normalize_ward_name(str(ward_name))
    payload["ward_id"] = ward_type_for_name(normalized).value
    payload["ward_name"] = normalized


def _run_risk_prediction(ward_id: str) -> Optional[dict[str, Any]]:
    try:
        return ml_service.predict_outbreak_risk(ward_id)
    except Exception:
        return None


def create_lab_result(
    body: LabResultCreate,
    entered_by_uid: str,
    entered_by_email: str,
    source: str = "manual",
    ocr_scan_id: Optional[str] = None,
) -> dict[str, Any]:
    ward = fs.get_ward(body.ward_id)
    if not ward:
        raise ValueError("Ward not found.")

    pathogen = fs.get_pathogen(body.pathogen_id)
    if not pathogen:
        raise ValueError("Pathogen not found.")

    user_name = _user_name(entered_by_uid, entered_by_email)
    colony_count = body.colony_count if body.colony_count is not None else 1
    anomaly = ml_service.detect_anomaly(body.pathogen_id, colony_count)

    data = body.model_dump(mode="json")
    data["entered_by_uid"] = entered_by_uid
    data["entered_by_name"] = user_name
    data["status"] = "pending"
    data["anomaly"] = anomaly
    data["source"] = source
    data["clinical_risk_class"] = pathogen.get("clinical_risk_class")
    data["positive_culture_count_48h"] = fs.count_positive_cultures_48h(
        body.ward_id,
        body.pathogen_id,
    ) + (1 if colony_count > 0 else 0)
    if ocr_scan_id:
        data["ocr_scan_id"] = ocr_scan_id

    result_id = fs.create_lab_result(data)

    alert_id = None
    if anomaly["is_anomaly"]:
        alert_id = fs.create_alert({
            "alert_type": "anomaly",
            "ward_id": body.ward_id,
            "title": f"Pathogen Anomaly - {body.pathogen_name} in {ward.get('name', body.ward_id)}",
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

    risk_prediction = _run_risk_prediction(body.ward_id)

    return {
        "result_id": result_id,
        "status": "pending",
        "ward_id": body.ward_id,
        "pathogen_id": body.pathogen_id,
        "pathogen_name": body.pathogen_name,
        "specimen_type": body.specimen_type,
        "test_result": body.test_result,
        "result_date": data["result_date"],
        "patient_ward_location": body.patient_ward_location,
        "colony_count": colony_count,
        "anomaly": anomaly,
        "alert_id": alert_id,
        "risk_prediction": risk_prediction,
        "message": "Lab result recorded. Anomaly detection and ward risk update complete.",
    }


def create_audit(
    body: AuditCreate,
    conducted_by_uid: str,
    conducted_by_email: str,
    source: str = "manual",
    ocr_scan_id: Optional[str] = None,
    extra_data: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    ward = fs.get_ward(body.ward_id)
    if not ward:
        raise ValueError("Ward not found.")

    scores = [
        body.hand_hygiene_score,
        body.ppe_score,
        body.waste_segregation_score,
        body.environmental_score,
    ]
    overall = sum(scores) / len(scores)
    user_name = _user_name(conducted_by_uid, conducted_by_email)

    data = body.model_dump(mode="json")
    data["overall_compliance_score"] = round(overall, 2)
    data["conducted_by_uid"] = conducted_by_uid
    data["conducted_by_name"] = user_name
    data["source"] = source
    if extra_data:
        data.update({k: v for k, v in extra_data.items() if v is not None})
    if ocr_scan_id:
        data["ocr_scan_id"] = ocr_scan_id

    audit_id = fs.create_audit(data)

    fs.update_document("wards", body.ward_id, {
        "compliance_score": round(overall, 2),
        "last_audit_at": datetime.now(timezone.utc),
    })

    alert_id = None
    if overall < 70.0:
        alert_id = fs.create_alert({
            "alert_type": "compliance_failure",
            "ward_id": body.ward_id,
            "title": f"Compliance Failure - {ward.get('name', body.ward_id)}",
            "description": (
                f"Ward compliance dropped to {overall:.1f}% (below 70% threshold). "
                f"Conducted by {user_name}."
            ),
            "severity": "high" if overall < 50 else "medium",
            "source_data": {"audit_id": audit_id, "overall_compliance_score": overall},
            "target_roles": ["icno", "sister"],
        })

    risk_prediction = _run_risk_prediction(body.ward_id)

    return {
        "audit_id": audit_id,
        "overall_compliance_score": round(overall, 2),
        "alert_id": alert_id,
        "risk_prediction": risk_prediction,
        "message": "Audit submitted and ward risk updated.",
    }


def commit_ocr_to_domain(
    collection: str,
    corrected_fields: dict[str, Any],
    committed_by_uid: str,
    committed_by_email: str,
    scan_id: str,
) -> dict[str, Any]:
    payload = dict(corrected_fields)
    _resolve_ward_id(payload)
    collection_key = collection.strip().lower().replace("-", "_")

    try:
        if collection_key in {"lab", "lab_result", "lab_results"}:
            return {
                "collection": "lab_results",
                **create_lab_result(
                    LabResultCreate(**payload),
                    committed_by_uid,
                    committed_by_email,
                    source="ocr",
                    ocr_scan_id=scan_id,
                ),
            }

        if collection_key in {"audit", "audits", "ward_audit", "ward_audits"}:
            return {
                "collection": "audits",
                **create_audit(
                    AuditCreate(**payload),
                    committed_by_uid,
                    committed_by_email,
                    source="ocr",
                    ocr_scan_id=scan_id,
                ),
            }

        if collection_key in {"moh", "moh_notification", "moh_notifications"}:
            notification_id = fs.create_document("moh_notifications", {
                **payload,
                "source": "ocr",
                "ocr_scan_id": scan_id,
                "committed_by_uid": committed_by_uid,
            })
            alert_id = fs.create_alert({
                "alert_type": "moh_notification",
                "ward_id": payload.get("ward_id"),
                "title": f"MoH Notification - {payload.get('disease', 'Special Disease')}",
                "description": payload.get("notes") or payload.get("disease") or "OCR-confirmed MoH notification requires ICNO validation.",
                "severity": payload.get("severity", "medium"),
                "source_data": {"notification_id": notification_id, "ocr_scan_id": scan_id},
                "target_roles": ["icno", "doctor"],
            })
            return {
                "collection": "moh_notifications",
                "notification_id": notification_id,
                "alert_id": alert_id,
                "message": "MoH notification saved and validation alert created.",
            }
    except ValidationError as exc:
        raise ValueError(exc.errors()) from exc

    raise ValueError(
        "OCR commit target must be one of: lab_results, audits, moh_notifications."
    )
