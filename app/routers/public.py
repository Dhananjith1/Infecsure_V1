"""
InfecSure - Public read-only endpoints.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.services import firebase_service as fs

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
    Return ward risk statuses for general awareness using only ICNO-approved
    or dispatched alerts as publication evidence.
    """
    wards = fs.list_wards()
    approved_alerts = fs.list_alerts(status="approved", limit=200) + fs.list_alerts(status="dispatched", limit=200)
    approved_by_ward = {}
    for alert in approved_alerts:
        ward_id = alert.get("ward_id")
        if ward_id:
            approved_by_ward.setdefault(ward_id, []).append(alert)

    heatmap = []
    for ward in wards:
        ward_id = ward["ward_id"]
        ward_alerts = approved_by_ward.get(ward_id, [])
        if ward_alerts:
            risk_level = ward.get("risk_level", "low")
            risk_score = ward.get("risk_score", 0.0)
        else:
            risk_level = "low"
            risk_score = 0.0
        heatmap.append({
            "ward_id": ward_id,
            "ward_name": ward.get("name", ward_id),
            "status": _color_for_risk(risk_level),
            "risk_level": risk_level,
            "risk_score": round(float(risk_score), 3),
            "validated_alert_count": len(ward_alerts),
        })

    return {"heatmap": heatmap}
