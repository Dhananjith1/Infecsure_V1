"""
InfecSure — Firebase / Firestore Service
==========================================
Generic CRUD helpers and domain-specific Firestore operations.
All Firestore interactions go through this layer.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from google.cloud.firestore_v1 import DocumentSnapshot

from app.config import db


# ─── Generic Helpers ──────────────────────────────────────────────────────────

def _now() -> datetime:
    return datetime.now(timezone.utc)


def _new_id() -> str:
    return str(uuid.uuid4())


def _doc_to_dict(doc: DocumentSnapshot) -> Optional[dict]:
    """Convert Firestore DocumentSnapshot to a plain dict (with id injected)."""
    if not doc.exists:
        return None
    data = doc.to_dict() or {}
    data["_id"] = doc.id
    return data


# ─── Generic CRUD ─────────────────────────────────────────────────────────────

def create_document(collection: str, data: dict, doc_id: Optional[str] = None) -> str:
    """Create a document, returning its ID."""
    if doc_id is None:
        doc_id = _new_id()
    data["created_at"] = _now()
    db.collection(collection).document(doc_id).set(data)
    return doc_id


def get_document(collection: str, doc_id: str) -> Optional[dict]:
    doc = db.collection(collection).document(doc_id).get()
    return _doc_to_dict(doc)


def update_document(collection: str, doc_id: str, data: dict) -> None:
    data["updated_at"] = _now()
    db.collection(collection).document(doc_id).update(data)


def delete_document(collection: str, doc_id: str) -> None:
    db.collection(collection).document(doc_id).delete()


def list_collection(
    collection: str,
    filters: Optional[list[tuple]] = None,
    order_by: Optional[str] = None,
    limit: int = 100,
) -> list[dict]:
    """
    List documents from a collection with optional filters.
    filters: list of (field, operator, value) tuples
    """
    ref = db.collection(collection)
    if filters:
        for field, op, value in filters:
            ref = ref.where(field, op, value)
    if order_by:
        ref = ref.order_by(order_by)
    ref = ref.limit(limit)
    docs = ref.stream()
    result = []
    for doc in docs:
        d = _doc_to_dict(doc)
        if d:
            result.append(d)
    return result


# ─── Domain: Users ────────────────────────────────────────────────────────────

def get_user_by_uid(uid: str) -> Optional[dict]:
    return get_document("users", uid)


def get_user_by_email(email: str) -> Optional[dict]:
    docs = list_collection("users", filters=[("email", "==", email)], limit=1)
    return docs[0] if docs else None


def list_users(limit: int = 100) -> list[dict]:
    return list_collection("users", order_by="full_name", limit=limit)


# ─── Domain: Wards ────────────────────────────────────────────────────────────

def create_ward(data: dict) -> str:
    ward_id = _new_id()
    data["ward_id"] = ward_id
    data["risk_level"] = "low"
    data["risk_score"] = 0.0
    data["compliance_score"] = 100.0
    return create_document("wards", data, doc_id=ward_id)


def get_ward(ward_id: str) -> Optional[dict]:
    return get_document("wards", ward_id)


def list_wards() -> list[dict]:
    return list_collection("wards", order_by="name")


def update_ward_risk(ward_id: str, risk_score: float, risk_level: str, compliance_score: float) -> None:
    update_document("wards", ward_id, {
        "risk_score": risk_score,
        "risk_level": risk_level,
        "compliance_score": compliance_score,
    })


# ─── Domain: Audits ──────────────────────────────────────────────────────────

def create_audit(data: dict) -> str:
    audit_id = _new_id()
    data["audit_id"] = audit_id
    return create_document("audits", data, doc_id=audit_id)


def get_audit(audit_id: str) -> Optional[dict]:
    return get_document("audits", audit_id)


def list_audits_for_ward(ward_id: str, limit: int = 50) -> list[dict]:
    return list_collection("audits", filters=[("ward_id", "==", ward_id)], order_by="created_at", limit=limit)


def list_all_audits(limit: int = 100) -> list[dict]:
    return list_collection("audits", order_by="created_at", limit=limit)


# ─── Domain: Lab Results ──────────────────────────────────────────────────────

def create_lab_result(data: dict) -> str:
    result_id = _new_id()
    data["result_id"] = result_id
    return create_document("lab_results", data, doc_id=result_id)


def get_lab_result(result_id: str) -> Optional[dict]:
    return get_document("lab_results", result_id)


def list_lab_results(ward_id: Optional[str] = None, limit: int = 100) -> list[dict]:
    filters = [("ward_id", "==", ward_id)] if ward_id else None
    return list_collection("lab_results", filters=filters, order_by="created_at", limit=limit)


def get_pathogen_history(pathogen_id: str, limit: int = 90) -> list[dict]:
    """Retrieve last N lab results for a pathogen (used by Z-Score)."""
    return list_collection(
        "lab_results",
        filters=[("pathogen_id", "==", pathogen_id)],
        order_by="created_at",
        limit=limit,
    )


# ─── Domain: Pathogen Stats (Z-Score rolling data) ────────────────────────────

def get_pathogen_stats(pathogen_id: str) -> Optional[dict]:
    return get_document("pathogen_stats", pathogen_id)


def upsert_pathogen_stats(pathogen_id: str, mean: float, std: float, count: int) -> None:
    db.collection("pathogen_stats").document(pathogen_id).set({
        "pathogen_id": pathogen_id,
        "mean": mean,
        "std": std,
        "count": count,
        "updated_at": _now(),
    }, merge=True)


# ─── Domain: Pathogens ────────────────────────────────────────────────────────

def create_pathogen(data: dict) -> str:
    pathogen_id = _new_id()
    data["pathogen_id"] = pathogen_id
    return create_document("pathogens", data, doc_id=pathogen_id)


def get_pathogen(pathogen_id: str) -> Optional[dict]:
    return get_document("pathogens", pathogen_id)


def list_pathogens() -> list[dict]:
    return list_collection("pathogens", order_by="name")


# ─── Domain: Alerts ──────────────────────────────────────────────────────────

def create_alert(data: dict) -> str:
    alert_id = _new_id()
    data["alert_id"] = alert_id
    data["status"] = "pending"
    return create_document("alerts", data, doc_id=alert_id)


def get_alert(alert_id: str) -> Optional[dict]:
    return get_document("alerts", alert_id)


def list_alerts(status: Optional[str] = None, limit: int = 100) -> list[dict]:
    filters = [("status", "==", status)] if status else None
    return list_collection("alerts", filters=filters, order_by="created_at", limit=limit)


def validate_alert(alert_id: str, validated_by_uid: str, icno_notes: Optional[str]) -> None:
    update_document("alerts", alert_id, {
        "status": "approved",
        "validated_at": _now(),
        "validated_by_uid": validated_by_uid,
        "icno_notes": icno_notes,
    })


def reject_alert(alert_id: str, validated_by_uid: str, icno_notes: Optional[str]) -> None:
    update_document("alerts", alert_id, {
        "status": "rejected",
        "validated_at": _now(),
        "validated_by_uid": validated_by_uid,
        "icno_notes": icno_notes,
    })


# ─── Domain: OCR Queue ────────────────────────────────────────────────────────

def create_ocr_record(data: dict) -> str:
    scan_id = _new_id()
    data["scan_id"] = scan_id
    data["status"] = "pending_review"
    return create_document("ocr_queue", data, doc_id=scan_id)


def get_ocr_record(scan_id: str) -> Optional[dict]:
    return get_document("ocr_queue", scan_id)


def confirm_ocr_record(scan_id: str, corrected_fields: dict) -> None:
    update_document("ocr_queue", scan_id, {
        "corrected_fields": corrected_fields,
        "status": "confirmed",
    })


def commit_ocr_record(scan_id: str) -> None:
    update_document("ocr_queue", scan_id, {"status": "committed"})


def list_ocr_queue(status: str = "pending_review") -> list[dict]:
    return list_collection("ocr_queue", filters=[("status", "==", status)], limit=50)


# ─── Domain: Reports ─────────────────────────────────────────────────────────

def create_report_record(data: dict) -> str:
    report_id = _new_id()
    data["report_id"] = report_id
    return create_document("reports", data, doc_id=report_id)


def get_report_record(report_id: str) -> Optional[dict]:
    return get_document("reports", report_id)


def list_reports(limit: int = 50) -> list[dict]:
    return list_collection("reports", order_by="created_at", limit=limit)


# ─── Domain: Notices ─────────────────────────────────────────────────────────

def create_notice(data: dict) -> str:
    notice_id = _new_id()
    data["notice_id"] = notice_id
    return create_document("notices", data, doc_id=notice_id)


def list_notices(limit: int = 50) -> list[dict]:
    return list_collection("notices", order_by="created_at", limit=limit)


def delete_notice(notice_id: str) -> None:
    delete_document("notices", notice_id)
