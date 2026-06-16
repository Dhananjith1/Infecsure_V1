"""
InfecSure — Heatmap Router
============================
GET /heatmap/ → Dynamic Hospital Heatmap data (all authenticated roles)
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.dependencies import get_current_user, require_role
from app.models.auth import TokenData
from app.models.user import UserRole
from app.services import fallback_data, firebase_service as fs

router = APIRouter(prefix="/heatmap", tags=["Hospital Heatmap"])

_ALL_AUTH = Depends(get_current_user)


@router.get("/", summary="Get hospital heatmap data")
async def get_heatmap(current_user: TokenData = _ALL_AUTH):
    """
    Returns ward-level risk scores, compliance scores, and anomaly counts
    for the Dynamic Hospital Heatmap visualization.

    All roles can access this. Staff role receives slightly aggregated data
    with no individual patient identifiers.
    """
    try:
        wards = fs.list_wards()
        all_lab_results = fs.list_lab_results(limit=500)
        all_audits = fs.list_all_audits(limit=500)
    except Exception as exc:
        if fallback_data.is_quota_error(exc):
            heatmap = fallback_data.heatmap(public_mode=current_user.role == UserRole.STAFF.value)
            return {
                "heatmap": heatmap,
                "summary": {
                    "total_wards": len(heatmap),
                    "critical_count": sum(1 for w in heatmap if w["risk_level"] == "critical"),
                    "high_count": sum(1 for w in heatmap if w["risk_level"] == "high"),
                    "medium_count": sum(1 for w in heatmap if w["risk_level"] == "medium"),
                    "low_count": sum(1 for w in heatmap if w["risk_level"] == "low"),
                },
                "fallback_reason": "Firestore quota exceeded",
            }
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
            last_audit_date = str(audits[-1].get("created_at", ""))[:10]

        entry = {
            "ward_id": ward_id,
            "ward_name": ward.get("name", ward_id),
            "ward_type": ward.get("ward_type", "general"),
            "floor": ward.get("floor"),
            "risk_level": ward.get("risk_level", "low"),
            "risk_score": round(ward.get("risk_score", 0.0), 1),
            "compliance_score": round(ward.get("compliance_score", 100.0), 1),
            "anomaly_count": anomaly_count,
            "last_audit_date": last_audit_date,
            "bed_count": ward.get("bed_count"),
        }

        # For staff, omit bed count and certain identifiers
        if current_user.role == UserRole.STAFF.value:
            entry.pop("bed_count", None)

        heatmap.append(entry)

    # Sort by risk score (highest first for most dangerous wards at top)
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


@router.post("/refresh", summary="Recalculate all ward risk scores (ICNO only)")
async def refresh_heatmap(
    current_user: TokenData = Depends(require_role(UserRole.ICNO)),
):
    """
    Trigger a full re-calculation of outbreak risk scores for all wards
    using the Random Forest Classifier. Results update the heatmap.
    """
    from app.services import ml_service

    wards = fs.list_wards()
    results = []
    for ward in wards:
        result = ml_service.predict_outbreak_risk(ward["ward_id"])
        results.append({
            "ward_id": ward["ward_id"],
            "ward_name": ward.get("name"),
            "risk_score": result.get("risk_score"),
            "risk_level": result.get("risk_level"),
            "alert_created": result.get("alert_created"),
        })

    return {
        "message": f"Heatmap refreshed for {len(results)} wards.",
        "results": results,
    }
