from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any


def firebase_unavailable() -> bool:
    from app.config import firebase_credentials_available

    return not firebase_credentials_available()


def is_quota_error(exc: Exception) -> bool:
    text = f"{type(exc).__name__} {exc}".lower()
    return "resourceexhausted" in text or "quota exceeded" in text or "429" in text


OCR_QUEUE: dict[str, dict[str, Any]] = {}
AUDITS: list[dict[str, Any]] = []
MOH_NOTIFICATIONS: list[dict[str, Any]] = []


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def create_ocr_record(data: dict[str, Any]) -> str:
    scan_id = f"fallback-ocr-{uuid.uuid4().hex[:12]}"
    record = dict(data)
    record.update({
        "scan_id": scan_id,
        "status": "pending_review",
        "created_at": _now_iso(),
        "fallback": True,
    })
    OCR_QUEUE[scan_id] = record
    return scan_id


def get_ocr_record(scan_id: str) -> dict[str, Any] | None:
    record = OCR_QUEUE.get(scan_id)
    return dict(record) if record else None


def confirm_ocr_record(scan_id: str, corrected_fields: dict[str, Any]) -> None:
    record = OCR_QUEUE.get(scan_id)
    if not record:
        return
    record["corrected_fields"] = dict(corrected_fields)
    record["status"] = "pending_review"


def approve_ocr_record(scan_id: str) -> None:
    record = OCR_QUEUE.get(scan_id)
    if not record:
        return
    record["status"] = "approved"
    record["approved_at"] = _now_iso()


def commit_ocr_record(scan_id: str) -> None:
    record = OCR_QUEUE.get(scan_id)
    if not record:
        return
    approve_ocr_record(scan_id)


def list_ocr_queue(status: str = "pending_review") -> list[dict[str, Any]]:
    return [dict(record) for record in OCR_QUEUE.values() if record.get("status") == status]


def _resolve_ward_id(payload: dict[str, Any]) -> None:
    if payload.get("ward_id"):
        return
    ward_name = payload.get("ward_name") or payload.get("ward")
    if not ward_name:
        return
    text = str(ward_name).strip().lower()
    if "female" in text:
        payload["ward_id"] = "female_ward"
    elif "male" in text:
        payload["ward_id"] = "male_ward"
    elif "etu" in text or "emergency" in text:
        payload["ward_id"] = "etu"
    elif "opd" in text:
        payload["ward_id"] = "opd"
    elif "family" in text or "clinic" in text:
        payload["ward_id"] = "family_medical_clinic"
    elif "psych" in text:
        payload["ward_id"] = "psychiatrist_clinic"


def commit_ocr_to_domain(
    collection: str,
    corrected_fields: dict[str, Any],
    committed_by_uid: str,
    committed_by_email: str,
    scan_id: str,
) -> dict[str, Any]:
    from app.models.audit import AuditCreate
    from app.models.lab import LabResultCreate
    from app.services import ml_service

    payload = dict(corrected_fields)
    _resolve_ward_id(payload)
    collection_key = collection.strip().lower().replace("-", "_")

    if collection_key in {"lab", "lab_result", "lab_results"}:
        body = LabResultCreate(**payload)
        colony_count = body.colony_count if body.colony_count is not None else 1
        anomaly = ml_service.detect_anomaly(body.pathogen_id, colony_count)
        result_id = f"fallback-lab-{uuid.uuid4().hex[:12]}"
        record = body.model_dump(mode="json")
        record.update({
            "result_id": result_id,
            "entered_by_uid": committed_by_uid,
            "entered_by_name": committed_by_email,
            "status": "pending",
            "anomaly": anomaly,
            "source": "ocr",
            "ocr_scan_id": scan_id,
        })
        LAB_RESULTS.append(record)
        if anomaly.get("is_anomaly"):
            ALERTS.append({
                "alert_id": f"fallback-alert-{uuid.uuid4().hex[:12]}",
                "alert_type": "anomaly",
                "ward_id": body.ward_id,
                "title": f"Pathogen Anomaly - {body.pathogen_name}",
                "description": anomaly.get("message"),
                "severity": anomaly.get("severity") or "warning",
                "status": "pending",
                "source_data": {"result_id": result_id, "z_score": anomaly.get("z_score"), "colony_count": colony_count},
                "target_roles": ["icno", "doctor"],
            })
        return {"collection": "lab_results", "result_id": result_id, "message": "Lab result recorded locally."}

    if collection_key in {"audit", "audits", "ward_audit", "ward_audits"}:
        body = AuditCreate(**payload)
        scores = [body.hand_hygiene_score, body.ppe_score, body.waste_segregation_score, body.environmental_score]
        overall = round(sum(scores) / len(scores), 2)
        audit_id = f"fallback-audit-{uuid.uuid4().hex[:12]}"
        record = body.model_dump(mode="json")
        record.update({
            "audit_id": audit_id,
            "overall_compliance_score": overall,
            "conducted_by_uid": committed_by_uid,
            "conducted_by_name": committed_by_email,
            "status": "submitted",
            "source": "ocr",
            "ocr_scan_id": scan_id,
        })
        AUDITS.append(record)
        for ward in WARDS:
            if ward["ward_id"] == body.ward_id:
                ward["compliance_score"] = overall
                break
        if overall < 70.0:
            ALERTS.append({
                "alert_id": f"fallback-alert-{uuid.uuid4().hex[:12]}",
                "alert_type": "compliance_failure",
                "ward_id": body.ward_id,
                "title": f"Compliance Failure - {body.ward_id}",
                "description": f"Ward compliance dropped to {overall:.1f}% (below 70% threshold).",
                "severity": "high" if overall < 50 else "medium",
                "status": "pending",
                "source_data": {"audit_id": audit_id, "overall_compliance_score": overall},
                "target_roles": ["icno", "sister"],
            })
        return {"collection": "audits", "audit_id": audit_id, "overall_compliance_score": overall, "message": "Audit recorded locally."}

    if collection_key in {"moh", "moh_notification", "moh_notifications"}:
        notification_id = f"fallback-moh-{uuid.uuid4().hex[:12]}"
        record = {
            **payload,
            "notification_id": notification_id,
            "source": "ocr",
            "ocr_scan_id": scan_id,
            "committed_by_uid": committed_by_uid,
        }
        MOH_NOTIFICATIONS.append(record)
        ALERTS.append({
            "alert_id": f"fallback-alert-{uuid.uuid4().hex[:12]}",
            "alert_type": "moh_notification",
            "ward_id": payload.get("ward_id"),
            "title": f"MoH Notification - {payload.get('disease', 'Special Disease')}",
            "description": payload.get("notes") or payload.get("disease") or "OCR-confirmed MoH notification requires ICNO validation.",
            "severity": payload.get("severity", "medium"),
            "status": "pending",
            "source_data": {"notification_id": notification_id, "ocr_scan_id": scan_id},
            "target_roles": ["icno", "doctor"],
        })
        return {"collection": "moh_notifications", "notification_id": notification_id, "message": "MoH notification saved locally."}

    raise ValueError("OCR commit target must be one of: lab_results, audits, moh_notifications.")


WARDS: list[dict[str, Any]] = [
    {"ward_id": "male_ward", "name": "Male Ward", "ward_type": "male_ward", "floor": "First", "risk_level": "medium", "risk_score": 0.4, "compliance_score": 58.0, "bed_count": 34},
    {"ward_id": "female_ward", "name": "Female Ward", "ward_type": "female_ward", "floor": "First", "risk_level": "low", "risk_score": 0.2, "compliance_score": 66.0, "bed_count": 32},
    {"ward_id": "etu", "name": "ETU", "ward_type": "etu", "floor": "Ground", "risk_level": "low", "risk_score": 0.1, "compliance_score": 90.0, "bed_count": 10},
    {"ward_id": "opd", "name": "OPD", "ward_type": "opd", "floor": "Ground", "risk_level": "low", "risk_score": 0.1, "compliance_score": 67.0, "bed_count": 18},
    {"ward_id": "psychiatrist_clinic", "name": "Psychiatrist Clinic", "ward_type": "psychiatrist_clinic", "floor": "Second", "risk_level": "low", "risk_score": 0.1, "compliance_score": 89.0, "bed_count": 16},
    {"ward_id": "family_medical_clinic", "name": "Family Medical Clinic", "ward_type": "family_medical_clinic", "floor": "Ground", "risk_level": "low", "risk_score": 0.0, "compliance_score": 78.0, "bed_count": 10},
]

LAB_RESULTS: list[dict[str, Any]] = [
    {"result_id": "fallback-lab-1", "ward_id": "male_ward", "pathogen_id": "dengue", "pathogen_name": "Dengue", "specimen_type": "blood", "result_date": "2026-06-16T00:00:00+00:00", "anomaly": {"is_anomaly": True, "z_score": 3.2, "severity": "critical"}},
    {"result_id": "fallback-lab-2", "ward_id": "female_ward", "pathogen_id": "dengue", "pathogen_name": "Dengue", "specimen_type": "blood", "result_date": "2026-06-16T00:00:00+00:00", "anomaly": {"is_anomaly": True, "z_score": 2.8, "severity": "warning"}},
    {"result_id": "fallback-lab-3", "ward_id": "etu", "pathogen_id": "dengue", "pathogen_name": "Dengue", "specimen_type": "blood", "result_date": "2026-06-16T00:00:00+00:00", "anomaly": {"is_anomaly": True, "z_score": 3.0, "severity": "critical"}},
]

ALERTS: list[dict[str, Any]] = [
    {"alert_id": "fallback-etu-heatmap", "alert_type": "outbreak_risk", "ward_id": "etu", "title": "Validated ICNO heatmap signal - ETU", "description": "ICNO-approved surveillance signal for ETU.", "severity": "high", "status": "approved", "target_roles": ["icno", "sister", "doctor"], "source_data": {"fallback": True}},
    {"alert_id": "fallback-female-anomaly", "alert_type": "anomaly", "ward_id": "female_ward", "title": "Female Ward Dengue anomaly", "description": "Z-score anomaly from Dengue lab results awaits ICNO review.", "severity": "high", "status": "pending", "target_roles": ["icno", "sister", "doctor"], "source_data": {"fallback": True}},
    {"alert_id": "fallback-opd-compliance", "alert_type": "compliance_failure", "ward_id": "opd", "title": "OPD PPE compliance failure", "description": "Audit checklist detected repeated PPE failures in OPD.", "severity": "medium", "status": "pending", "target_roles": ["icno", "sister", "doctor"], "source_data": {"fallback": True}},
]

ROOT_CAUSE_RULES: list[dict[str, Any]] = [
    {
        "antecedents": ["FAIL:ppe", "EVENT:anomaly_detected"],
        "consequents": ["FAIL:hand_hygiene"],
        "support": 0.333,
        "confidence": 1.0,
        "lift": 3.0,
        "interpretation": "When PPE compliance failure and Z-score anomaly occurs, hand hygiene failure is associated with it in 100% of matching patterns.",
        "source": "fallback",
    },
    {
        "antecedents": ["FAIL:waste_segregation", "PATHOGEN:DENGUE"],
        "consequents": ["EVENT:anomaly_detected"],
        "support": 0.333,
        "confidence": 1.0,
        "lift": 2.0,
        "interpretation": "When waste segregation failure and Dengue detection occurs, Z-score anomaly is associated with it in 100% of matching patterns.",
        "source": "fallback",
    },
]

ROLE_BY_EMAIL = {
    "icno@infecsure.com": "icno",
    "matron@infecsure.com": "sister",
    "lab@infecsure.com": "lab",
    "doctor@infecsure.com": "doctor",
    "staff@infecsure.com": "staff",
}


def heatmap(public_mode: bool = False) -> list[dict[str, Any]]:
    rows = []
    for ward in WARDS:
        row = {
            "ward_id": ward["ward_id"],
            "ward_name": ward["name"],
            "ward_type": ward["ward_type"],
            "floor": ward["floor"],
            "risk_level": ward["risk_level"],
            "risk_score": ward["risk_score"],
            "compliance_score": ward["compliance_score"],
            "anomaly_count": sum(1 for result in LAB_RESULTS if result["ward_id"] == ward["ward_id"] and result.get("anomaly", {}).get("is_anomaly")),
            "validated_alert_count": sum(1 for alert in ALERTS if alert.get("ward_id") == ward["ward_id"] and alert.get("status") in {"approved", "dispatched"}),
            "status": "red" if ward["risk_level"] in {"high", "critical"} else "amber" if ward["risk_level"] == "medium" else "green",
            "fallback": True,
        }
        if not public_mode:
            row["bed_count"] = ward["bed_count"]
        rows.append(row)
    return rows


def dashboard_summary() -> dict[str, Any]:
    anomalies = sum(1 for result in LAB_RESULTS if result.get("anomaly", {}).get("is_anomaly"))
    return {
        "total_wards": len(WARDS),
        "risk_distribution": {"low": 5, "medium": 1, "high": 0, "critical": 0},
        "average_compliance": round(sum(float(w["compliance_score"]) for w in WARDS) / len(WARDS), 1),
        "pending_alerts": sum(1 for alert in ALERTS if alert["status"] == "pending"),
        "recent_anomalies": anomalies,
        "hospital_risk_level": "medium",
        "fallback": True,
    }


def priority_list() -> list[dict[str, Any]]:
    rows = []
    for index, ward in enumerate(sorted(WARDS, key=lambda item: float(item["risk_score"]), reverse=True), start=1):
        rows.append({
            "rank": index,
            "ward_id": ward["ward_id"],
            "ward_name": ward["name"],
            "priority_score": round(float(ward["risk_score"]) * 100, 1),
            "compliance_deficit": round(100 - float(ward["compliance_score"]), 1),
            "recent_lab_count": sum(1 for result in LAB_RESULTS if result["ward_id"] == ward["ward_id"]),
            "anomaly_count": sum(1 for result in LAB_RESULTS if result["ward_id"] == ward["ward_id"] and result.get("anomaly", {}).get("is_anomaly")),
            "recommended_action": "Review ward risk, compliance, and lab signals.",
            "fallback": True,
        })
    return rows
