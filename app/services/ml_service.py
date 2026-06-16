"""
InfecSure — Machine Learning Service
======================================
Implements all four core algorithms:

1. Z-Score Anomaly Detection     → triggered on every lab result entry
2. Random Forest Classifier      → ward-level outbreak risk prediction
3. Risk-Weighted Heuristic       → ICNO daily task prioritization
   P = (w1 * C) + (w2 * V) + (w3 * L)
4. Apriori Algorithm             → root cause association mining

All models are trained on the fly from Firestore historical data using
Scikit-Learn and MLxtend.  No pre-trained model file is required.

Heavy imports (pandas, sklearn, mlxtend, numpy) are deferred to inside
the function bodies that need them so they are only loaded on first use.
"""

from __future__ import annotations

import gc
import logging
import math
from datetime import datetime, timedelta, timezone
from time import monotonic
from typing import Any, Optional

from app.services import firebase_service as fs

logger = logging.getLogger(__name__)

# ─── Constants ────────────────────────────────────────────────────────────────

Z_SCORE_WARNING = 2.0
Z_SCORE_CRITICAL = 3.0

W1_COMPLIANCE = 0.40   # Audit compliance deficit weight
W2_PATHOGEN_VIRULENCE = 0.35  # Pathogen risk level weight
W3_LAB_LOAD = 0.25     # Recent lab result volume weight

RF_N_ESTIMATORS = 50
RF_RANDOM_STATE = 42
RF_MAX_DEPTH = 10

RISK_THRESHOLD_LOW = 25.0
RISK_THRESHOLD_MEDIUM = 50.0
RISK_THRESHOLD_HIGH = 75.0

ROOT_CAUSE_CACHE_SECONDS = 120
_ROOT_CAUSE_CACHE: dict[tuple[float, float, float, int], tuple[float, list[dict[str, Any]]]] = {}
TASK_PRIORITY_CACHE_SECONDS = 120
_TASK_PRIORITY_CACHE: dict[str, tuple[float, list[dict[str, Any]]]] = {}


# ─── Helper Utilities ─────────────────────────────────────────────────────────

def _risk_level_from_score(score: float) -> str:
    if score < RISK_THRESHOLD_LOW:
        return "low"
    elif score < RISK_THRESHOLD_MEDIUM:
        return "medium"
    elif score < RISK_THRESHOLD_HIGH:
        return "high"
    else:
        return "critical"


def _pathogen_risk_to_numeric(risk_level: str) -> float:
    # Changed to 1.0, 2.0, 3.0 to match the Exact Spec Document
    return {"low": 1.0, "moderate": 2.0, "high": 3.0, "critical": 3.0}.get(
        risk_level.lower(), 1.0
    )


def _as_datetime(value: Any) -> Optional[datetime]:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if isinstance(value, str):
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
            return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
        except ValueError:
            return None
    return None


# ─── 1. Z-Score Anomaly Detection ─────────────────────────────────────────────

def detect_anomaly(pathogen_id: str, new_count: int) -> dict[str, Any]:
    try:
        stats = fs.get_pathogen_stats(pathogen_id)

        if stats is None or stats.get("count", 0) < 5:
            try:
                history = fs.get_pathogen_history(pathogen_id, limit=90) or []
                counts = [r.get("colony_count", 1) for r in history if r.get("colony_count") is not None]
            except Exception:
                counts = []

            counts.append(new_count)

            if len(counts) > 1:
                mean = sum(counts) / len(counts)
                variance = sum((x - mean) ** 2 for x in counts) / len(counts)
                std = variance ** 0.5
            else:
                mean = float(new_count)
                std = 0.0

            try:
                fs.upsert_pathogen_stats(pathogen_id, mean, std, len(counts))
            except Exception:
                pass

            return {
                "is_anomaly": False,
                "z_score": 0.0,
                "message": "Insufficient history",
                "severity": None
            }

        mean = float(stats.get("mean", 0))
        std = float(stats.get("std", 0))
        count = int(stats.get("count", 0))

        z = (new_count - mean) / std if std > 0 else 0.0

        new_count_total = count + 1
        delta = new_count - mean
        new_mean = mean + delta / new_count_total
        delta2 = new_count - new_mean
        new_m2 = (std ** 2) * count + delta * delta2
        new_std = math.sqrt(new_m2 / new_count_total) if new_count_total > 1 else 0.0

        try:
            fs.upsert_pathogen_stats(pathogen_id, new_mean, new_std, new_count_total)
        except Exception:
            pass

        is_anomaly = abs(z) >= Z_SCORE_WARNING
        severity = None
        message = None

        if abs(z) >= Z_SCORE_CRITICAL:
            severity = "critical"
            message = f"CRITICAL trend break detected (Z={z:.2f}). Immediate ICNO review required."
        elif abs(z) >= Z_SCORE_WARNING:
            severity = "warning"
            message = f"Unusual pathogen frequency detected (Z={z:.2f}). Review recommended."

        return {
            "is_anomaly": is_anomaly,
            "z_score": round(z, 3),
            "message": message,
            "severity": severity,
        }

    except Exception as e:
        logger.error(f"detect_anomaly failed: {e}")
        return {
            "is_anomaly": False,
            "z_score": 0.0,
            "message": "Anomaly detection unavailable",
            "severity": None
        }


# ─── 2. Random Forest Outbreak Risk Prediction ────────────────────────────────

def _build_feature_vector(ward_id: str) -> Optional[dict[str, float]]:
    ward = fs.get_ward(ward_id)
    if not ward:
        return None

    audits = fs.list_audits_for_ward(ward_id, limit=5)
    if audits:
        latest_audit = audits[-1]
        compliance = latest_audit.get("overall_compliance_score", 100.0)
        hand_hygiene = latest_audit.get("hand_hygiene_score", 100.0)
        ppe_score = latest_audit.get("ppe_score", 100.0)
        waste_score = latest_audit.get("waste_segregation_score", 100.0)
        env_score = latest_audit.get("environmental_score", 100.0)
    else:
        compliance = 100.0
        hand_hygiene = 100.0
        ppe_score = 100.0
        waste_score = 100.0
        env_score = 100.0

    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=30)
    lab_results = fs.list_lab_results(ward_id=ward_id, limit=200)
    recent_results = []
    for result in lab_results:
        created_at = _as_datetime(result.get("created_at"))
        if created_at and created_at >= cutoff:
            recent_results.append(result)

    anomaly_count = sum(
        1 for r in recent_results
        if r.get("anomaly", {}) and r["anomaly"].get("is_anomaly", False)
    )

    max_virulence = 0.0
    for r in recent_results:
        pathogen = fs.get_pathogen(r.get("pathogen_id", ""))
        if pathogen:
            v = _pathogen_risk_to_numeric(pathogen.get("risk_level", "low"))
            max_virulence = max(max_virulence, v)

    return {
        "compliance_score": compliance,
        "hand_hygiene_score": hand_hygiene,
        "ppe_score": ppe_score,
        "waste_score": waste_score,
        "environmental_score": env_score,
        "recent_lab_count": len(recent_results),
        "anomaly_count": anomaly_count,
        "max_virulence": max_virulence,
        "days_since_last_audit": (
            (now - _as_datetime(audits[-1].get("created_at"))).days
            if audits and _as_datetime(audits[-1].get("created_at"))
            else 30
        ),
    }


def predict_outbreak_risk(ward_id: str) -> dict[str, Any]:
    import joblib
    import numpy as np
    
    try:
        rf_model = joblib.load("ml_models/rf_outbreak_model.pkl")
    except Exception as e:
        logger.error(f"Failed to load pre-trained RF model: {e}")
        return _heuristic_fallback_risk(ward_id)

    target_fv = _build_feature_vector(ward_id)
    if not target_fv:
        return {"ward_id": ward_id, "risk_score": 0.0, "risk_score_percent": 0.0, "risk_level": "low",
                "confidence": 0.0, "feature_importance": {}, "alert_created": False}

    feature_names = [
        "hand_hygiene_score", "ppe_score", "waste_score", "environmental_score", 
        "recent_lab_count", "anomaly_count", "max_virulence", "days_since_last_audit"
    ]

    target_row = np.array([[
        float(target_fv.get(f, 0)) for f in feature_names
    ]], dtype=np.float32)

    proba = rf_model.predict_proba(target_row)[0]
    risk_probability = float(proba[1])
    risk_score_percent = risk_probability * 100
    risk_level = _risk_level_from_score(risk_score_percent)

    # ── Feature Importance Extraction (NEW) ──
    importances = rf_model.feature_importances_
    feature_importance_dict = {
        name: round(float(imp), 4) for name, imp in zip(feature_names, importances)
    }

    try:
        fs.update_ward_risk(ward_id, risk_probability, risk_level, target_fv.get("compliance_score", 100.0))
    except Exception as e:
        logger.warning(f"Could not update ward risk in Firestore: {e}")

    alert_created = False
    if risk_level in ("high", "critical"):
        try:
            ward = fs.get_ward(ward_id)
            ward_name = ward.get('name', ward_id) if ward else ward_id
            fs.create_alert({
                "alert_type": "outbreak_risk",
                "ward_id": ward_id,
                "title": f"Outbreak Risk Alert — {ward_name}",
                "description": f"AI Model predicts {risk_level.upper()} outbreak risk (probability: {risk_score_percent:.1f}%) for {ward_name}.",
                "severity": risk_level,
                "source_data": {"risk_score": risk_probability, "risk_score_percent": risk_score_percent},
                "target_roles": ["icno", "sister", "doctor"],
            })
            alert_created = True
        except Exception:
            pass

    return {
        "ward_id": ward_id,
        "risk_score": round(risk_probability, 4),
        "risk_score_percent": round(risk_score_percent, 2),
        "risk_level": risk_level,
        "confidence": round(float(max(proba)), 3),
        "feature_importance": feature_importance_dict, # Included the weights!
        "alert_created": alert_created,
        "model_used": "Pre-trained Random Forest (pkl)"
    }

def _heuristic_fallback_risk(ward_id: str) -> dict[str, Any]:
    ward = fs.get_ward(ward_id)
    compliance = ward.get("compliance_score", 100.0) if ward else 100.0
    risk_score_percent = max(0.0, 100.0 - compliance)
    risk_probability = risk_score_percent / 100.0
    risk_level = _risk_level_from_score(risk_score_percent)
    fs.update_ward_risk(ward_id, risk_probability, risk_level, compliance)
    return {
        "ward_id": ward_id,
        "risk_score": round(risk_probability, 4),
        "risk_score_percent": round(risk_score_percent, 2),
        "risk_level": risk_level,
        "confidence": 0.5,
        "feature_importance": {},
        "alert_created": False,
        "note": "Heuristic fallback (insufficient training data)",
    }


# ─── 3. Risk-Weighted Heuristic Engine ───────────────────────────────────────

def calculate_task_priority(ward_ids: Optional[list[str]] = None) -> list[dict[str, Any]]:
    cache_key = ",".join(sorted(ward_ids)) if ward_ids else "all"
    cached = _TASK_PRIORITY_CACHE.get(cache_key)
    if cached and monotonic() - cached[0] < TASK_PRIORITY_CACHE_SECONDS:
        return cached[1]

    if ward_ids is None:
        wards = fs.list_wards()
        ward_ids = [w["ward_id"] for w in wards]

    priorities = []
    all_lab_counts = []
    ward_data = {}

    for wid in ward_ids:
        fv = _build_feature_vector(wid)
        ward = fs.get_ward(wid)
        ward_data[wid] = (fv, ward)
        if fv:
            all_lab_counts.append(fv["recent_lab_count"])

    max_lab = max(all_lab_counts) if all_lab_counts else 1
    if max_lab == 0:
        max_lab = 1

    for wid in ward_ids:
        fv, ward = ward_data.get(wid, (None, None))
        if not fv or not ward:
            continue

        C = max(0.0, (100.0 - fv["compliance_score"])) / 100.0
        V = fv["max_virulence"]
        L = fv["recent_lab_count"] / max_lab

        priority_score = (W1_COMPLIANCE * C) + (W2_PATHOGEN_VIRULENCE * V) + (W3_LAB_LOAD * L)
        priority_score_100 = round(priority_score * 100, 2)

        priorities.append({
            "ward_id": wid,
            "ward_name": ward.get("name", wid),
            "priority_score": priority_score_100,
            "compliance_deficit": round(C * 100, 1),
            "max_virulence": round(V, 3),
            "recent_lab_count": fv["recent_lab_count"],
            "anomaly_count": fv["anomaly_count"],
            "recommended_action": _recommend_action(C, V, fv["anomaly_count"]),
        })

    priorities.sort(key=lambda x: x["priority_score"], reverse=True)

    for i, p in enumerate(priorities):
        p["rank"] = i + 1

    _TASK_PRIORITY_CACHE[cache_key] = (monotonic(), priorities)
    return priorities


def _recommend_action(compliance_deficit: float, virulence: float, anomaly_count: int) -> str:
    if anomaly_count > 3:
        return "Urgent: Multiple pathogen anomalies detected. Immediate lab review required."
    if compliance_deficit > 0.5:
        return "High compliance deficit. Schedule immediate ward audit and staff re-training."
    if virulence > 0.7:
        return "High-risk pathogen present. Review isolation protocols and PPE compliance."
    if compliance_deficit > 0.2:
        return "Moderate compliance issues. Schedule audit within 24 hours."
    return "Routine monitoring — maintain current protocols."


# ─── 4. Apriori Algorithm — Root Cause Association ───────────────────────────

def find_root_cause_associations(
    min_support: float = 0.1,
    min_confidence: float = 0.5,
    min_lift: float = 1.0,
    max_rules: int = 25,
) -> list[dict[str, Any]]:
    cache_key = (min_support, min_confidence, min_lift, max_rules)
    cached = _ROOT_CAUSE_CACHE.get(cache_key)
    if cached and monotonic() - cached[0] < ROOT_CAUSE_CACHE_SECONDS:
        return cached[1]

    try:
        import pandas as pd  # noqa: PLC0415
        from mlxtend.frequent_patterns import apriori, association_rules  # noqa: PLC0415
        from mlxtend.preprocessing import TransactionEncoder  # noqa: PLC0415
    except ImportError:
        return [{"error": "MLxtend / pandas not available"}]

    all_wards = fs.list_wards()
    transactions = []

    for ward in all_wards:
        wid = ward["ward_id"]
        items = set()

        audits = fs.list_audits_for_ward(wid, limit=10)
        for audit in audits:
            if audit.get("hand_hygiene_score", 100) < 70:
                items.add("FAIL:hand_hygiene")
            if audit.get("ppe_score", 100) < 70:
                items.add("FAIL:ppe")
            if audit.get("waste_segregation_score", 100) < 70:
                items.add("FAIL:waste_segregation")
            if audit.get("environmental_score", 100) < 70:
                items.add("FAIL:environmental")

        lab_results = fs.list_lab_results(ward_id=wid, limit=50)
        for result in lab_results:
            pathogen_name = result.get("pathogen_name", "unknown")
            items.add(f"PATHOGEN:{pathogen_name.replace(' ', '_').upper()}")
            if result.get("anomaly", {}) and result["anomaly"].get("is_anomaly"):
                items.add("EVENT:anomaly_detected")

        if items:
            transactions.append(list(items))

    if len(transactions) < 3:
        return [{"message": "Insufficient transaction data for association mining. Add more ward audit and lab data."}]

    te = TransactionEncoder()
    te_array = te.fit_transform(transactions)
    df_enc = pd.DataFrame(te_array, columns=te.columns_)

    frequent_itemsets = apriori(df_enc, min_support=min_support, use_colnames=True)

    if frequent_itemsets.empty:
        return [{"message": f"No frequent itemsets found at min_support={min_support}. Try lowering the threshold."}]

    try:
        rules = association_rules(frequent_itemsets, metric="confidence", min_threshold=min_confidence)
    except TypeError as exc:
        if "num_itemsets" not in str(exc):
            raise
        rules = association_rules(
            frequent_itemsets,
            num_itemsets=len(frequent_itemsets),
            metric="confidence",
            min_threshold=min_confidence,
        )
    rules = rules[rules["lift"] >= min_lift]

    if rules.empty:
        return [{"message": "No significant association rules found with current thresholds."}]

    result = []
    for _, row in rules.iterrows():
        result.append({
            "antecedents": list(row["antecedents"]),
            "consequents": list(row["consequents"]),
            "support": round(float(row["support"]), 3),
            "confidence": round(float(row["confidence"]), 3),
            "lift": round(float(row["lift"]), 3),
            "interpretation": _interpret_rule(
                list(row["antecedents"]), list(row["consequents"]), float(row["confidence"])
            ),
        })

    result.sort(key=lambda x: (x["lift"], x["confidence"], x["support"]), reverse=True)
    limited_result = result[:max(1, max_rules)]
    _ROOT_CAUSE_CACHE[cache_key] = (monotonic(), limited_result)
    return limited_result

def _interpret_rule(antecedents: list, consequents: list, confidence: float) -> str:
    ant_str = " & ".join(a.replace("FAIL:", "Failed ").replace("PATHOGEN:", "Pathogen: ").replace("_", " ").title() for a in antecedents)
    con_str = " & ".join(c.replace("FAIL:", "Failed ").replace("PATHOGEN:", "Pathogen: ").replace("EVENT:", "Event: ").replace("_", " ").title() for c in consequents)
    return f"When [{ant_str}], there is a {confidence*100:.0f}% chance of [{con_str}]."


# ─── 5. Dashboard Summary ────────────────────────────────────────────────────

def get_dashboard_summary() -> dict[str, Any]:
    wards = fs.list_wards()
    risk_distribution = {"low": 0, "medium": 0, "high": 0, "critical": 0}
    total_compliance = 0.0

    for w in wards:
        level = w.get("risk_level", "low")
        risk_distribution[level] = risk_distribution.get(level, 0) + 1
        total_compliance += w.get("compliance_score", 100.0)

    avg_compliance = total_compliance / len(wards) if wards else 100.0

    pending_alerts = fs.list_alerts(status="pending", limit=200)
    recent_lab = fs.list_lab_results(limit=50)
    anomaly_count = sum(
        1 for r in recent_lab
        if r.get("anomaly") and r["anomaly"].get("is_anomaly", False)
    )

    return {
        "total_wards": len(wards),
        "risk_distribution": risk_distribution,
        "average_compliance": round(avg_compliance, 1),
        "pending_alerts": len(pending_alerts),
        "recent_anomalies": anomaly_count,
        "hospital_risk_level": _risk_level_from_score(100.0 - avg_compliance),
    }

