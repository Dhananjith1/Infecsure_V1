from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.config import db


NOW = datetime.now(timezone.utc)


WARDS = [
    ("etu", "ETU", "etu", 12, "Ground", "high", 0.82, 58.0),
    ("male_ward", "Male Ward", "male_ward", 34, "First", "critical", 0.91, 52.0),
    ("female_ward", "Female Ward", "female_ward", 32, "First", "high", 0.74, 63.0),
    ("opd", "OPD", "opd", 18, "Ground", "medium", 0.46, 71.0),
    ("family_medical_clinic", "Family Medical Clinic", "family_medical_clinic", 10, "Ground", "medium", 0.38, 78.0),
    ("psychiatrist_clinic", "Psychiatrist Clinic", "psychiatrist_clinic", 16, "Second", "low", 0.18, 88.0),
]

PATHOGENS = {
    "dengue": {
        "pathogen_id": "dengue",
        "name": "Dengue",
        "category": "virus",
        "risk_level": "high",
        "transmission_mode": "vector",
    },
    "mrsa": {
        "pathogen_id": "mrsa",
        "name": "MRSA",
        "category": "bacteria",
        "risk_level": "high",
        "transmission_mode": "contact",
    },
    "covid19": {
        "pathogen_id": "covid19",
        "name": "COVID-19",
        "category": "virus",
        "risk_level": "moderate",
        "transmission_mode": "droplet",
    },
}


def set_doc(collection: str, doc_id: str, data: dict) -> None:
    db.collection(collection).document(doc_id).set(data, merge=True)


def audit_items(prefix: str, score: int) -> list[dict]:
    return [
        {"item_name": f"{prefix} check 1", "compliant": score >= 70},
        {"item_name": f"{prefix} check 2", "compliant": score >= 80},
        {"item_name": f"{prefix} check 3", "compliant": score >= 90},
    ]


def seed_wards() -> None:
    for ward_id, name, ward_type, beds, floor, risk_level, risk_score, compliance in WARDS:
        set_doc(
            "wards",
            ward_id,
            {
                "ward_id": ward_id,
                "name": name,
                "ward_type": ward_type,
                "bed_count": beds,
                "floor": floor,
                "description": f"ICNO surveillance unit for {name}.",
                "risk_level": risk_level,
                "risk_score": risk_score,
                "compliance_score": compliance,
                "last_audit_at": NOW - timedelta(days=1),
                "created_at": NOW - timedelta(days=30),
                "updated_at": NOW,
            },
        )


def seed_pathogens() -> None:
    for pathogen_id, data in PATHOGENS.items():
        set_doc("pathogens", pathogen_id, {**data, "created_at": NOW - timedelta(days=30), "updated_at": NOW})
    set_doc("pathogen_stats", "dengue", {"pathogen_id": "dengue", "mean": 4.0, "std": 1.5, "count": 14, "updated_at": NOW})
    set_doc("pathogen_stats", "mrsa", {"pathogen_id": "mrsa", "mean": 2.0, "std": 1.0, "count": 9, "updated_at": NOW})
    set_doc("pathogen_stats", "covid19", {"pathogen_id": "covid19", "mean": 3.0, "std": 1.2, "count": 11, "updated_at": NOW})


def seed_audits() -> None:
    audit_rows = [
        ("audit-etu-001", "etu", 62, 68, 55, 61, "Garbage removal delayed near isolation bay."),
        ("audit-male-001", "male_ward", 58, 66, 50, 59, "Toilet hygiene and waste segregation need immediate action."),
        ("audit-female-001", "female_ward", 72, 71, 56, 64, "Waste bins overfilled; lighting maintenance requested."),
        ("audit-opd-001", "opd", 76, 63, 58, 70, "High patient flow; PPE adherence inconsistent."),
        ("audit-family-001", "family_medical_clinic", 84, 82, 68, 79, "Garbage removal missed before clinic rush."),
        ("audit-psy-001", "psychiatrist_clinic", 91, 89, 86, 88, "Routine follow-up only."),
    ]
    for index, (audit_id, ward_id, hand, ppe, waste, env, remarks) in enumerate(audit_rows):
        created_at = NOW - timedelta(days=index + 1)
        overall = round((hand + ppe + waste + env) / 4, 1)
        set_doc(
            "audits",
            audit_id,
            {
                "audit_id": audit_id,
                "ward_id": ward_id,
                "hand_hygiene_score": hand,
                "ppe_score": ppe,
                "waste_segregation_score": waste,
                "environmental_score": env,
                "overall_compliance_score": overall,
                "hand_hygiene_items": audit_items("Hand hygiene", hand),
                "ppe_items": audit_items("PPE", ppe),
                "waste_segregation_items": audit_items("Waste segregation", waste),
                "environmental_items": audit_items("Environmental hygiene", env),
                "remarks": remarks,
                "is_offline_sync": False,
                "created_at": created_at,
                "updated_at": created_at,
            },
        )


def seed_lab_results() -> None:
    rows = [
        ("lab-etu-dengue-001", "etu", "dengue", "Dengue", 9, True, 3.2, "critical"),
        ("lab-male-dengue-001", "male_ward", "dengue", "Dengue", 11, True, 4.1, "critical"),
        ("lab-female-dengue-001", "female_ward", "dengue", "Dengue", 8, True, 2.8, "warning"),
        ("lab-opd-covid-001", "opd", "covid19", "COVID-19", 5, False, 1.1, None),
        ("lab-family-mrsa-001", "family_medical_clinic", "mrsa", "MRSA", 6, True, 2.4, "warning"),
        ("lab-psy-covid-001", "psychiatrist_clinic", "covid19", "COVID-19", 2, False, 0.4, None),
    ]
    for index, (result_id, ward_id, pathogen_id, pathogen_name, count, is_anomaly, z_score, severity) in enumerate(rows):
        created_at = NOW - timedelta(hours=6 + index)
        anomaly = {
            "is_anomaly": is_anomaly,
            "z_score": z_score,
            "message": f"{pathogen_name} Z-score signal requires ICNO review." if is_anomaly else "Within expected baseline.",
            "severity": severity,
        }
        set_doc(
            "lab_results",
            result_id,
            {
                "result_id": result_id,
                "ward_id": ward_id,
                "pathogen_id": pathogen_id,
                "pathogen_name": pathogen_name,
                "specimen_type": "blood",
                "result_date": created_at,
                "colony_count": count,
                "resistance_profile": ["MRSA"] if pathogen_id == "mrsa" else [],
                "antibiotic_sensitivity": {"ampicillin": "R"} if pathogen_id == "mrsa" else {},
                "patient_ward_location": ward_id,
                "notes": "Seeded ICNO surveillance result.",
                "entered_by_uid": "seed-lab-user",
                "entered_by_name": "Seed Lab Officer",
                "anomaly": anomaly,
                "created_at": created_at,
                "updated_at": created_at,
            },
        )


def seed_alerts() -> None:
    pending_alerts = [
        ("pending-etu-outbreak", "outbreak_risk", "etu", "High ETU outbreak risk", "AI outbreak model flagged ETU for urgent ICNO validation.", "high"),
        ("pending-female-anomaly", "anomaly", "female_ward", "Female Ward Dengue anomaly", "Z-score anomaly from recent Dengue lab results awaits ICNO approval.", "high"),
        ("pending-opd-compliance", "compliance_failure", "opd", "OPD PPE compliance failure", "Audit checklist detected repeated PPE failures in OPD.", "medium"),
    ]
    for alert_id, alert_type, ward_id, title, description, severity in pending_alerts:
        set_doc(
            "alerts",
            alert_id,
            {
                "alert_id": alert_id,
                "alert_type": alert_type,
                "ward_id": ward_id,
                "title": title,
                "description": description,
                "severity": severity,
                "status": "pending",
                "source_data": {"seeded": True, "requires_icno_validation": True},
                "target_roles": ["icno", "sister", "doctor"],
                "created_at": NOW - timedelta(hours=3),
                "updated_at": NOW - timedelta(hours=3),
            },
        )

    for ward_id, name, _ward_type, _beds, _floor, risk_level, risk_score, compliance in WARDS:
        alert_id = f"approved-{ward_id}-heatmap"
        set_doc(
            "alerts",
            alert_id,
            {
                "alert_id": alert_id,
                "alert_type": "outbreak_risk" if risk_level in {"high", "critical"} else "compliance_failure",
                "ward_id": ward_id,
                "title": f"Validated ICNO heatmap signal - {name}",
                "description": f"ICNO-approved surveillance signal for {name}: risk {risk_level}, compliance {compliance}%.",
                "severity": risk_level,
                "status": "approved",
                "source_data": {
                    "seeded": True,
                    "risk_score": risk_score,
                    "compliance_score": compliance,
                    "format": "SOMRO/MoH dispatch-ready",
                },
                "target_roles": ["icno", "sister", "doctor"],
                "icno_notes": "Seeded approved alert so public and dashboard heatmaps can show all hospital units.",
                "validated_at": NOW - timedelta(hours=2),
                "validated_by_uid": "seed-icno-user",
                "created_at": NOW - timedelta(hours=8),
                "updated_at": NOW - timedelta(hours=2),
            },
        )


def main() -> None:
    seed_wards()
    seed_pathogens()
    seed_audits()
    seed_lab_results()
    seed_alerts()
    print("Seeded ICNO wards, audits, lab results, Apriori data, and validation-gate alerts.")


if __name__ == "__main__":
    main()
