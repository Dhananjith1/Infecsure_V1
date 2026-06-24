from __future__ import annotations

from typing import Any


def is_quota_error(exc: Exception) -> bool:
    text = f"{type(exc).__name__} {exc}".lower()
    return (
        "resourceexhausted" in text 
        or "quota exceeded" in text 
        or "429" in text
        or "service account" in text
        or "credentials" in text
        or "not found" in text
    )


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
