"""
InfecSure - Public read-only endpoints.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.services import fallback_data, firebase_service as fs

router = APIRouter(prefix="/public", tags=["Public Access"])


def _color_for_risk(risk_level: str) -> str:
    return {
        "low": "green",
        "medium": "amber",
        "high": "red",
        "critical": "red",
    }.get(str(risk_level).lower(), "green")


@router.get("/heatmap", summary="Public validated ward risk heatmap")
async def public_heatmap():
    """
    Return authoritative ward risk statuses, compliance scores, and anomaly counts
    for general hospital awareness and staff portals.
    """
    try:
        wards = fs.list_wards()
        all_lab_results = fs.list_lab_results(limit=100)
        all_audits = fs.list_all_audits(limit=100)
        approved_alerts = fs.list_alerts(status="approved", limit=50) + fs.list_alerts(status="dispatched", limit=50)
    except Exception as exc:
        if fallback_data.is_quota_error(exc):
            return {"heatmap": fallback_data.heatmap(public_mode=False), "fallback_reason": "Firestore quota exceeded"}
        raise

    lab_by_ward: dict[str, list[dict]] = {}
    for result in all_lab_results:
        ward_id = result.get("ward_id")
        if ward_id:
            lab_by_ward.setdefault(ward_id, []).append(result)

    audits_by_ward: dict[str, list[dict]] = {}
    for audit in all_audits:
        ward_id = audit.get("ward_id")
        if ward_id:
            audits_by_ward.setdefault(ward_id, []).append(audit)

    approved_by_ward: dict[str, list[dict]] = {}
    for alert in approved_alerts:
        ward_id = alert.get("ward_id")
        if ward_id:
            approved_by_ward.setdefault(ward_id, []).append(alert)

    heatmap = []
    for ward in wards:
        ward_id = ward["ward_id"]
        lab_results = lab_by_ward.get(ward_id, [])
        anomaly_count = sum(
            1 for r in lab_results
            if r.get("anomaly") and r["anomaly"].get("is_anomaly", False)
        )

        audits = audits_by_ward.get(ward_id, [])
        last_audit_date = None
        if audits:
            last_audit_date = str(audits[0].get("created_at", ""))[:10]
        elif ward.get("last_audit_at"):
            last_audit_date = str(ward.get("last_audit_at", ""))[:10]

        ward_alerts = approved_by_ward.get(ward_id, [])
        if ward_alerts:
            risk_level = str(ward.get("risk_level", "low")).lower()
            risk_score = round(float(ward.get("risk_score", 0.0)), 3)
        else:
            risk_level = "low"
            risk_score = 0.0

        heatmap.append({
            "ward_id": ward_id,
            "ward_name": ward.get("name", ward_id),
            "ward_type": ward.get("ward_type", "general"),
            "floor": ward.get("floor"),
            "status": _color_for_risk(risk_level),
            "risk_level": risk_level,
            "risk_score": risk_score,
            "compliance_score": round(ward.get("compliance_score", 100.0), 1),
            "anomaly_count": anomaly_count,
            "last_audit_date": last_audit_date,
            "validated_alert_count": len(ward_alerts),
            "bed_count": ward.get("bed_count"),
        })

    # Sort by risk score (highest risk first) to match /heatmap/
    heatmap.sort(key=lambda x: x["risk_score"], reverse=True)

    return {
        "heatmap": heatmap,
        "summary": {
            "total_wards": len(heatmap),
            "critical_count": sum(1 for w in heatmap if w["risk_level"] == "critical"),
            "high_count": sum(1 for w in heatmap if w["risk_level"] == "high"),
            "medium_count": sum(1 for w in heatmap if w["risk_level"] == "medium"),
            "low_count": sum(1 for w in heatmap if w["risk_level"] == "low"),
        }
    }

