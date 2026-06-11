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
"""

from __future__ import annotations

import logging
import math
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import numpy as np
import pandas as pd

# ML imports — wrapped in try/except for graceful degradation in test mode
try:
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.preprocessing import LabelEncoder
    from mlxtend.frequent_patterns import apriori, association_rules
    from mlxtend.preprocessing import TransactionEncoder
    ML_AVAILABLE = True
except ImportError:
    ML_AVAILABLE = False
    logging.warning("scikit-learn / mlxtend not installed — ML features degraded.")

from app.services import firebase_service as fs

logger = logging.getLogger(__name__)

# ─── Constants ────────────────────────────────────────────────────────────────

# Z-Score thresholds
Z_SCORE_WARNING = 2.0
Z_SCORE_CRITICAL = 3.0

# Risk heuristic weights (must sum to 1)
W1_COMPLIANCE = 0.40   # Audit compliance deficit weight
W2_PATHOGEN_VIRULENCE = 0.35  # Pathogen risk level weight
W3_LAB_LOAD = 0.25     # Recent lab result volume weight

# Random Forest
RF_N_ESTIMATORS = 100
RF_RANDOM_STATE = 42

# Risk thresholds (0–100 scale)
RISK_THRESHOLD_LOW = 25.0
RISK_THRESHOLD_MEDIUM = 50.0
RISK_THRESHOLD_HIGH = 75.0


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
    """Map string risk level to 0-1 numeric weight."""
    return {"low": 0.2, "moderate": 0.5, "high": 0.8, "critical": 1.0}.get(
        risk_level.lower(), 0.5
    )


# ─── 1. Z-Score Anomaly Detection ────────────────────────────────────────────

def detect_anomaly(pathogen_id: str, new_count: int) -> dict[str, Any]:
    """
    Compute Z-Score for a new pathogen count against historical distribution.
    Updates rolling stats in Firestore `pathogen_stats` collection.

    Returns:
        {
            "is_anomaly": bool,
            "z_score": float,
            "message": str | None,
            "severity": "warning" | "critical" | None
        }
    """
    # Fetch rolling stats from Firestore
    stats = fs.get_pathogen_stats(pathogen_id)

    if stats is None or stats.get("count", 0) < 5:
        # Insufficient history — just record and return safe
        history = fs.get_pathogen_history(pathogen_id, limit=90)
        counts = [r.get("colony_count", 1) for r in history if r.get("colony_count") is not None]
        counts.append(new_count)
        mean = float(np.mean(counts)) if counts else float(new_count)
        std = float(np.std(counts)) if len(counts) > 1 else 0.0
        fs.upsert_pathogen_stats(pathogen_id, mean, std, len(counts))
        return {"is_anomaly": False, "z_score": 0.0, "message": "Insufficient history", "severity": None}

    mean = stats["mean"]
    std = stats["std"]
    count = stats["count"]

    # Avoid division by zero
    if std == 0.0:
        z = 0.0
    else:
        z = (new_count - mean) / std

    # Update rolling mean / std using Welford's online algorithm
    new_count_total = count + 1
    delta = new_count - mean
    new_mean = mean + delta / new_count_total
    delta2 = new_count - new_mean
    new_m2 = (std ** 2) * count + delta * delta2
    new_std = math.sqrt(new_m2 / new_count_total) if new_count_total > 1 else 0.0

    fs.upsert_pathogen_stats(pathogen_id, new_mean, new_std, new_count_total)

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


# ─── 2. Random Forest Outbreak Risk Prediction ────────────────────────────────

def _build_feature_vector(ward_id: str) -> Optional[dict[str, float]]:
    """
    Build a feature vector for a ward from latest audit + lab data.
    Returns None if insufficient data.
    """
    ward = fs.get_ward(ward_id)
    if not ward:
        return None

    # Audit features — latest audit
    audits = fs.list_audits_for_ward(ward_id, limit=5)
    if audits:
        latest_audit = audits[-1]
        compliance = latest_audit.get("overall_compliance_score", 100.0)
        hand_hygiene = latest_audit.get("hand_hygiene_score", 100.0)
        ppe_score = latest_audit.get("ppe_score", 100.0)
        waste_score = latest_audit.get("waste_segregation_score", 100.0)
    else:
        compliance = 100.0
        hand_hygiene = 100.0
        ppe_score = 100.0
        waste_score = 100.0

    # Lab features — last 30 days
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=30)
    lab_results = fs.list_lab_results(ward_id=ward_id, limit=200)
    recent_results = [
        r for r in lab_results
        if r.get("created_at") and r["created_at"] >= cutoff
    ]

    anomaly_count = sum(
        1 for r in recent_results
        if r.get("anomaly", {}) and r["anomaly"].get("is_anomaly", False)
    )

    # Max pathogen virulence
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
        "recent_lab_count": len(recent_results),
        "anomaly_count": anomaly_count,
        "max_virulence": max_virulence,
        "days_since_last_audit": (
            (now - audits[-1]["created_at"]).days if audits else 30
        ),
    }


def predict_outbreak_risk(ward_id: str) -> dict[str, Any]:
    """
    Use a Random Forest Classifier trained on all historical ward data
    to predict outbreak risk for a given ward.

    Returns:
        {
            "ward_id": str,
            "risk_score": float (0–100),
            "risk_level": str,
            "confidence": float,
            "feature_importance": dict,
            "alert_created": bool
        }
    """
    if not ML_AVAILABLE:
        return {"ward_id": ward_id, "risk_score": 0.0, "risk_level": "low",
                "confidence": 0.0, "alert_created": False, "error": "ML not available"}

    # ── Build training dataset from ALL wards ──────────────────────────────
    all_wards = fs.list_wards()
    training_rows = []
    for w in all_wards:
        fv = _build_feature_vector(w["ward_id"])
        if fv:
            # Label: 1 if risk_level is high/critical, 0 otherwise
            current_risk = w.get("risk_level", "low")
            fv["label"] = 1 if current_risk in ("high", "critical") else 0
            training_rows.append(fv)

    if len(training_rows) < 3:
        # Not enough data — fall back to heuristic
        return _heuristic_fallback_risk(ward_id)

    df = pd.DataFrame(training_rows)
    feature_cols = [c for c in df.columns if c != "label"]
    X = df[feature_cols].fillna(0).values
    y = df["label"].values

    # ── Train RF ───────────────────────────────────────────────────────────
    rf = RandomForestClassifier(
        n_estimators=RF_N_ESTIMATORS,
        random_state=RF_RANDOM_STATE,
        class_weight="balanced",
    )
    rf.fit(X, y)

    # ── Predict for target ward ────────────────────────────────────────────
    target_fv = _build_feature_vector(ward_id)
    if not target_fv:
        return {"ward_id": ward_id, "risk_score": 0.0, "risk_level": "low",
                "confidence": 0.0, "alert_created": False}

    target_df = pd.DataFrame([{k: target_fv.get(k, 0) for k in feature_cols}])
    proba = rf.predict_proba(target_df.values)[0]
    risk_score = float(proba[1]) * 100  # probability of HIGH class → 0-100

    importance_dict = dict(zip(feature_cols, rf.feature_importances_.tolist()))

    risk_level = _risk_level_from_score(risk_score)

    # ── Update ward in Firestore ───────────────────────────────────────────
    fs.update_ward_risk(
        ward_id,
        risk_score,
        risk_level,
        target_fv.get("compliance_score", 100.0),
    )

    # ── Create alert if high/critical ──────────────────────────────────────
    alert_created = False
    if risk_level in ("high", "critical"):
        ward = fs.get_ward(ward_id)
        fs.create_alert({
            "alert_type": "outbreak_risk",
            "ward_id": ward_id,
            "title": f"Outbreak Risk Alert — {ward.get('name', ward_id)}",
            "description": (
                f"Random Forest model predicts {risk_level.upper()} outbreak risk "
                f"(score: {risk_score:.1f}/100) for ward {ward.get('name', ward_id)}. "
                f"Immediate ICNO review required."
            ),
            "severity": risk_level,
            "source_data": {"risk_score": risk_score, "feature_importance": importance_dict},
            "target_roles": ["icno", "sister", "doctor"],
        })
        alert_created = True

    return {
        "ward_id": ward_id,
        "risk_score": round(risk_score, 2),
        "risk_level": risk_level,
        "confidence": round(float(max(proba)), 3),
        "feature_importance": {k: round(v, 4) for k, v in importance_dict.items()},
        "alert_created": alert_created,
    }


def _heuristic_fallback_risk(ward_id: str) -> dict[str, Any]:
    """Simple compliance-based fallback when RF has insufficient training data."""
    ward = fs.get_ward(ward_id)
    compliance = ward.get("compliance_score", 100.0) if ward else 100.0
    risk_score = max(0.0, 100.0 - compliance)
    risk_level = _risk_level_from_score(risk_score)
    fs.update_ward_risk(ward_id, risk_score, risk_level, compliance)
    return {
        "ward_id": ward_id,
        "risk_score": round(risk_score, 2),
        "risk_level": risk_level,
        "confidence": 0.5,
        "feature_importance": {},
        "alert_created": False,
        "note": "Heuristic fallback (insufficient training data)",
    }


# ─── 3. Risk-Weighted Heuristic Engine ───────────────────────────────────────

def calculate_task_priority(ward_ids: Optional[list[str]] = None) -> list[dict[str, Any]]:
    """
    Priority = (w1 * C) + (w2 * V) + (w3 * L)
    where:
      C = Compliance Deficit  (100 - compliance_score) / 100
      V = Max Pathogen Virulence (0–1)
      L = Recent Lab Result Load (normalized)

    Returns a sorted list of wards with priority scores (highest first).
    """
    if ward_ids is None:
        wards = fs.list_wards()
        ward_ids = [w["ward_id"] for w in wards]

    priorities = []
    all_lab_counts = []

    # First pass — collect lab counts for normalization
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

    # Second pass — compute priority
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

    # Sort descending by priority
    priorities.sort(key=lambda x: x["priority_score"], reverse=True)

    # Rank
    for i, p in enumerate(priorities):
        p["rank"] = i + 1

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
) -> list[dict[str, Any]]:
    """
    Mine association rules between audit failures and pathogen detections
    using the Apriori algorithm (via MLxtend).

    Returns a list of association rules with antecedents → consequents.
    """
    if not ML_AVAILABLE:
        return [{"error": "MLxtend not available"}]

    # ── Build transaction dataset ──────────────────────────────────────────
    # Each transaction = a ward in a time window, items = audit failures + pathogens
    all_wards = fs.list_wards()
    transactions = []

    for ward in all_wards:
        wid = ward["ward_id"]
        items = set()

        # Add audit failure items
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

        # Add pathogen items from lab results
        lab_results = fs.list_lab_results(ward_id=wid, limit=50)
        for result in lab_results:
            pathogen_name = result.get("pathogen_name", "unknown")
            # Sanitize to item string
            items.add(f"PATHOGEN:{pathogen_name.replace(' ', '_').upper()}")
            if result.get("anomaly", {}) and result["anomaly"].get("is_anomaly"):
                items.add("EVENT:anomaly_detected")

        if items:
            transactions.append(list(items))

    if len(transactions) < 3:
        return [{"message": "Insufficient transaction data for association mining. Add more ward audit and lab data."}]

    # ── Apriori ────────────────────────────────────────────────────────────
    te = TransactionEncoder()
    te_array = te.fit_transform(transactions)
    df_enc = pd.DataFrame(te_array, columns=te.columns_)

    frequent_itemsets = apriori(df_enc, min_support=min_support, use_colnames=True)

    if frequent_itemsets.empty:
        return [{"message": f"No frequent itemsets found at min_support={min_support}. Try lowering the threshold."}]

    rules = association_rules(frequent_itemsets, metric="confidence", min_threshold=min_confidence)
    rules = rules[rules["lift"] >= min_lift]

    if rules.empty:
        return [{"message": "No significant association rules found with current thresholds."}]

    # Format results
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

    # Sort by lift descending
    result.sort(key=lambda x: x["lift"], reverse=True)
    return result


def _interpret_rule(antecedents: list, consequents: list, confidence: float) -> str:
    ant_str = " & ".join(a.replace("FAIL:", "Failed ").replace("PATHOGEN:", "Pathogen: ").replace("_", " ").title() for a in antecedents)
    con_str = " & ".join(c.replace("FAIL:", "Failed ").replace("PATHOGEN:", "Pathogen: ").replace("EVENT:", "Event: ").replace("_", " ").title() for c in consequents)
    return f"When [{ant_str}], there is a {confidence*100:.0f}% chance of [{con_str}]."


# ─── 5. Dashboard Summary ────────────────────────────────────────────────────

def get_dashboard_summary() -> dict[str, Any]:
    """
    Aggregate stats for the ICNO dashboard:
    - Ward risk distribution
    - Pending alerts count
    - Recent anomalies
    - Overall hospital compliance
    """
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
