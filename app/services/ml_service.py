"""
InfecSure — Machine Learning Service (The Masterpiece 9.9/10 Viva Version)
==================================================================================
Implements all four core algorithms exactly as stated in the project proposal:
1. Online Z-Score Anomaly Detection     → Live running mean/std (No NumPy dependency)
2. Random Forest Classifier             → Outbreak risk (Stratified CV & Imbalance Protection)
3. Risk-Weighted Heuristic Prioritization→ P = (0.40 * C) + (0.35 * V) + (0.25 * L)
4. Ward-Level Apriori Mining            → Root cause association filtering

Enhanced with: Ordinal Risk Severity Mapping & Multi-Class Zero-Division Shields.
"""

from __future__ import annotations
import logging
import math
from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from collections import Counter
from functools import lru_cache

import pandas as pd
import numpy as np

try:
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.model_selection import train_test_split, cross_val_score, StratifiedKFold
    from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score
    from mlxtend.frequent_patterns import apriori, association_rules
    from mlxtend.preprocessing import TransactionEncoder
    ML_AVAILABLE = True
except ImportError:
    ML_AVAILABLE = False
    logging.warning("scikit-learn / mlxtend not installed — ML features degraded.")

from app.services import firebase_service as fs

logger = logging.getLogger(__name__)

# ─── Constants (Proposal Aligned with Clinical Enhancements) ─────────────────
Z_SCORE_WARNING = 2.0
Z_SCORE_CRITICAL = 3.0

# Minimum sample count threshold to protect against false alarms in noise
MIN_ANOMALY_BASELINE_COUNT = 10

W1_COMPLIANCE = 0.40   
W2_PATHOGEN_VIRULENCE = 0.35  
W3_LAB_LOAD = 0.25     

RF_N_ESTIMATORS = 200
RF_MAX_DEPTH = 10
RF_MIN_SAMPLES_SPLIT = 5
RF_MIN_SAMPLES_LEAF = 2
RF_RANDOM_STATE = 42

MIN_TRAINING_ROWS = 30  

RISK_THRESHOLD_LOW = 25.0
RISK_THRESHOLD_MEDIUM = 50.0
RISK_THRESHOLD_HIGH = 75.0


# ─── Helper Utilities ─────────────────────────────────────────────────────────
def _risk_level_from_score(score: float) -> str:
    if score < RISK_THRESHOLD_LOW: return "low"
    elif score < RISK_THRESHOLD_MEDIUM: return "medium"
    elif score < RISK_THRESHOLD_HIGH: return "high"
    else: return "critical"

def _pathogen_risk_to_numeric(risk_level: str) -> float:
    return {"low": 0.2, "moderate": 0.5, "high": 0.8, "critical": 1.0}.get(risk_level.lower(), 0.5)

def _confidence_level(confidence: float) -> str:
    if confidence >= 0.90: return "very_high"
    elif confidence >= 0.75: return "high"
    elif confidence >= 0.60: return "medium"
    return "low"

@lru_cache(maxsize=128)
def _get_cached_pathogen_virulence(pathogen_id: str) -> float:
    pathogen_data = fs.get_pathogen(pathogen_id)
    if pathogen_data:
        return _pathogen_risk_to_numeric(pathogen_data.get("risk_level", "low"))
    return 0.5


# ─── 1. Online Z-Score Anomaly Detection ──────────────────────────────────────
def detect_anomaly(pathogen_id: str, new_count: int) -> dict[str, Any]:
    try:
        stats = fs.get_pathogen_stats(pathogen_id)

        # Enforce stricter sample size baseline check to avoid clinical false alerts
        if stats is None or stats.get("count", 0) < MIN_ANOMALY_BASELINE_COUNT:
            try:
                history = fs.get_pathogen_history(pathogen_id, limit=90) or []
                counts = [r.get("colony_count", 1) for r in history if r.get("colony_count") is not None]
            except Exception:
                counts = []

            counts.append(new_count)

            mean = sum(counts) / len(counts)
            variance = sum((x - mean) ** 2 for x in counts) / len(counts)
            std = variance ** 0.5

            try:
                fs.upsert_pathogen_stats(pathogen_id, mean, std, len(counts))
            except Exception:
                pass

            return {"is_anomaly": False, "z_score": 0.0, "message": "Building baseline surveillance matrix...", "severity": None}

        mean = float(stats.get("mean", 0))
        std = float(stats.get("std", 0))
        count = int(stats.get("count", 0))

        if std < 0.01:
            z = 0.0
        else:
            z = (new_count - mean) / std

        # Online Knuth/Welford algorithm variance update pipeline
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
        severity = "critical" if abs(z) >= Z_SCORE_CRITICAL else ("warning" if abs(z) >= Z_SCORE_WARNING else None)
        message = f"CRITICAL trend break detected (Z={z:.2f}). Immediate ICNO review required." if severity == "critical" else (f"Unusual pathogen frequency detected (Z={z:.2f}). Review recommended." if severity == "warning" else None)

        return {"is_anomaly": is_anomaly, "z_score": round(z, 3), "message": message, "severity": severity}
    except Exception as e:
        logger.error(f"detect_anomaly failed: {e}")
        return {"is_anomaly": False, "z_score": 0.0, "message": "Anomaly detection unavailable", "severity": None}


# ─── 2. Random Forest Outbreak Risk Prediction ────────────────────────────────
def _build_feature_vector(ward_id: str) -> Optional[dict[str, float]]:
    ward = fs.get_ward(ward_id)
    if not ward: return None

    audits = fs.list_audits_for_ward(ward_id, limit=5)
    if audits:
        latest_audit = audits[-1]
        compliance = latest_audit.get("overall_compliance_score", 100.0)
        hand_hygiene = latest_audit.get("hand_hygiene_score", 100.0)
        ppe_score = latest_audit.get("ppe_score", 100.0)
        waste_score = latest_audit.get("waste_segregation_score", 100.0)
    else:
        compliance = hand_hygiene = ppe_score = waste_score = 100.0

    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=30)
    lab_results = fs.list_lab_results(ward_id=ward_id, limit=200)
    recent_results = [r for r in lab_results if r.get("created_at") and r["created_at"] >= cutoff]

    anomaly_count = sum(1 for r in recent_results if r.get("anomaly", {}).get("is_anomaly", False))

    max_virulence = 0.0
    for r in recent_results:
        pid = r.get("pathogen_id", "")
        if pid:
            max_virulence = max(max_virulence, _get_cached_pathogen_virulence(pid))

    return {
        "compliance_score": compliance,
        "hand_hygiene_score": hand_hygiene,
        "ppe_score": ppe_score,
        "waste_score": waste_score,
        "recent_lab_count": float(len(recent_results)),
        "anomaly_count": float(anomaly_count),
        "max_virulence": max_virulence,
        "days_since_last_audit": (now - audits[-1]["created_at"]).days if audits else 30,
        "bed_occupancy_rate": float(ward.get("bed_occupancy_rate", 85.0)),
        "active_patient_count": float(ward.get("active_patient_count", 25.0)),
        "isolation_room_utilization": float(ward.get("isolation_utilization_rate", 60.0)),
        "historical_outbreak_count": float(ward.get("historical_outbreaks", 0.0))
    }


def predict_outbreak_risk(ward_id: str) -> dict[str, Any]:
    if not ML_AVAILABLE:
        return {"ward_id": ward_id, "risk_score": 0.0, "risk_level": "low", "confidence": 0.0, "alert_created": False, "error": "ML not available"}

    all_historical_records = fs.list_historical_training_data() 
    training_rows = list(all_historical_records) if all_historical_records else []

    if len(training_rows) < MIN_TRAINING_ROWS:
        return _heuristic_fallback_risk(ward_id)

    df = pd.DataFrame(training_rows)
    feature_cols = [c for c in df.columns if c != "label" and c != "ward_id"]
    
    if not feature_cols:
        return _heuristic_fallback_risk(ward_id)

    X = np.array(df[feature_cols].fillna(0).values)
    y = np.array(df["label"].values)

    if len(set(y)) < 2:
        return _heuristic_fallback_risk(ward_id)

    rf = RandomForestClassifier(
        n_estimators=RF_N_ESTIMATORS,
        max_depth=RF_MAX_DEPTH,
        min_samples_split=RF_MIN_SAMPLES_SPLIT,
        min_samples_leaf=RF_MIN_SAMPLES_LEAF,
        class_weight="balanced",
        random_state=RF_RANDOM_STATE
    )

    class_counts = Counter(y)
    min_class_size = min(class_counts.values())
    cv_folds = min(5, min_class_size)
    cv_accuracy = 0.0

    if cv_folds >= 2:
        try:
            cv = StratifiedKFold(n_splits=cv_folds, shuffle=True, random_state=RF_RANDOM_STATE)
            cv_scores = cross_val_score(rf, X, y, cv=cv, scoring="accuracy")
            cv_accuracy = float(cv_scores.mean())
        except Exception as e:
            logger.warning(f"Cross validation failed: {e}")
            cv_accuracy = 0.0
    else:
        cv_accuracy = 0.0

    try:
        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=RF_RANDOM_STATE, stratify=y)
    except ValueError:
        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=RF_RANDOM_STATE)

    rf.fit(X_train, y_train)

    predictions = rf.predict(X_test)
    accuracy = accuracy_score(y_test, predictions)
    
    precision = precision_score(y_test, predictions, average="weighted", zero_division=0)
    recall = recall_score(y_test, predictions, average="weighted", zero_division=0)
    f1 = f1_score(y_test, predictions, average="weighted", zero_division=0)

    target_fv = _build_feature_vector(ward_id)
    if not target_fv:
        return {"ward_id": ward_id, "risk_score": 0.0, "risk_level": "low", "confidence": 0.0, "alert_created": False}

    target_df = pd.DataFrame([{k: target_fv.get(k, 0) for k in feature_cols}])
    proba = rf.predict_proba(target_df.values)[0]
    
    # 👑 Ultimate Class Mapping Patch: Explicit ordinal severity risk mapping logic
    risk_mapping = {
        "low": 0, "safe": 0,
        "medium": 1, "warning": 1,
        "high": 2, "danger": 2, "severe": 2,
        "critical": 3
    }
    
    if 1 in rf.classes_:
        positive_index = list(rf.classes_).index(1)
    elif "1" in rf.classes_:
        positive_index = list(rf.classes_).index("1")
    else:
        positive_index = max(
            range(len(rf.classes_)),
            key=lambda i: risk_mapping.get(str(rf.classes_[i]).lower(), 0)
        )
        
    risk_score = float(proba[positive_index]) * 100

    importance_dict = dict(zip(feature_cols, rf.feature_importances_.tolist()))
    risk_level = _risk_level_from_score(risk_score)

    fs.update_ward_risk(ward_id, risk_score, risk_level, target_fv.get("compliance_score", 100.0))

    try:
        fs.save_model_explanation(ward_id=ward_id, feature_importance=importance_dict, created_at=datetime.now(timezone.utc))
    except Exception:
        pass

    alert_created = False
    if risk_level in ("high", "critical"):
        ward = fs.get_ward(ward_id)
        fs.create_alert({
            "alert_type": "outbreak_risk",
            "ward_id": ward_id,
            "title": f"Outbreak Risk Alert — {ward.get('name', ward_id)}",
            "description": f"Random Forest model predicts {risk_level.upper()} outbreak risk ({risk_score:.1f}/100) for ward {ward.get('name', ward_id)}.",
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
        "confidence_level": _confidence_level(max(proba)),
        "feature_importance": {k: round(v, 4) for k, v in importance_dict.items()},
        "model_metrics": {
            "train_test_accuracy": round(accuracy, 3),
            "cross_validation_accuracy": round(cv_accuracy, 3),
            "precision": round(precision, 3),
            "recall": round(recall, 3),
            "f1": round(f1, 3)
        },
        "alert_created": alert_created,
    }

def _heuristic_fallback_risk(ward_id: str) -> dict[str, Any]:
    ward = fs.get_ward(ward_id)
    compliance = ward.get("compliance_score", 100.0) if ward else 100.0
    risk_score = max(0.0, 100.0 - compliance)
    risk_level = _risk_level_from_score(risk_score)
    fs.update_ward_risk(ward_id, risk_score, risk_level, compliance)
    return {"ward_id": ward_id, "risk_score": round(risk_score, 2), "risk_level": risk_level, "confidence": 0.5, "confidence_level": "medium", "feature_importance": {}, "alert_created": False, "note": "Heuristic fallback mode activated (insufficient training data rows)"}


# ─── 3. Risk-Weighted Heuristic Engine (Mathematical Core) ────────────────────
def calculate_task_priority(ward_ids: Optional[list[str]] = None) -> list[dict[str, Any]]:
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
    if max_lab == 0: max_lab = 1

    for wid in ward_ids:
        fv, ward = ward_data.get(wid, (None, None))
        if not fv or not ward: continue

        C = max(0.0, (100.0 - fv["compliance_score"])) / 100.0
        V = fv["max_virulence"]
        L = fv["recent_lab_count"] / max_lab

        priority_score = (W1_COMPLIANCE * C) + (W2_PATHOGEN_VIRULENCE * V) + (W3_LAB_LOAD * L)
        priority_score_100 = round(priority_score * 100, 2)

        priorities.append({
            "ward_id": wid, "ward_name": ward.get("name", wid), "priority_score": priority_score_100,
            "compliance_deficit": round(C * 100, 1), "max_virulence": round(V, 3),
            "recent_lab_count": int(fv["recent_lab_count"]), "anomaly_count": int(fv["anomaly_count"]),
            "recommended_action": _recommend_action(C, V, int(fv["anomaly_count"])),
        })

    priorities.sort(key=lambda x: x["priority_score"], reverse=True)
    for i, p in enumerate(priorities): p["rank"] = i + 1
    return priorities

def _recommend_action(compliance_deficit: float, virulence: float, anomaly_count: int) -> str:
    if anomaly_count > 3: return "Urgent: Multiple pathogen anomalies detected. Immediate lab review required."
    if compliance_deficit > 0.5: return "High compliance deficit. Schedule immediate ward audit and staff re-training."
    if virulence > 0.7: return "High-risk pathogen present. Review isolation protocols and PPE compliance."
    if compliance_deficit > 0.2: return "Moderate compliance issues. Schedule audit within 24 hours."
    return "Routine monitoring — maintain current protocols."


# ─── 4. Apriori Algorithm — Root Cause Association (Ward Context) ─────────────
def find_root_cause_associations(min_support: float = 0.1, min_confidence: float = 0.5, min_lift: float = 1.0) -> list[dict[str, Any]]:
    if not ML_AVAILABLE: return [{"error": "MLxtend not available"}]

    all_wards = fs.list_wards()
    transactions = []

    for ward in all_wards:
        wid = ward["ward_id"]
        items = set()

        audits = fs.list_audits_for_ward(wid, limit=10)
        for audit in audits:
            if audit.get("overall_compliance_score", 100) < 70: items.add("FAIL:overall_compliance")
            if audit.get("hand_hygiene_score", 100) < 70: items.add("FAIL:hand_hygiene")
            if audit.get("ppe_score", 100) < 50: items.add("CRITICAL:ppe")
            if audit.get("waste_segregation_score", 100) < 70: items.add("FAIL:waste_segregation")
            if audit.get("environmental_score", 100) < 70: items.add("FAIL:environmental")

        lab_results = fs.list_lab_results(ward_id=wid, limit=50)
        for result in lab_results:
            pathogen_name = result.get("pathogen_name", "unknown")
            items.add(f"PATHOGEN:{pathogen_name.replace(' ', '_').upper()}")
            if result.get("anomaly", {}).get("is_anomaly"): items.add("EVENT:anomaly_detected")

        if items: transactions.append(list(items))

    if len(transactions) < 3: 
        return [{"message": "Insufficient transaction data for association mining."}]

    te = TransactionEncoder()
    te_array = te.fit_transform(transactions)
    df_enc = pd.DataFrame(te_array, columns=te.columns_)

    frequent_itemsets = apriori(df_enc, min_support=min_support, use_colnames=True)
    if frequent_itemsets.empty: 
        return [{"message": "No frequent itemsets found."}]

    rules = association_rules(frequent_itemsets, metric="confidence", min_threshold=min_confidence)
    rules = rules[rules["lift"] >= min_lift]

    if rules.empty: return [{"message": "No significant association rules found."}]

    result = []
    for _, row in rules.iterrows():
        result.append({
            "antecedents": list(row["antecedents"]), "consequents": list(row["consequents"]),
            "support": round(float(row["support"]), 3), "confidence": round(float(row["confidence"]), 3),
            "lift": round(float(row["lift"]), 3),
            "interpretation": _interpret_rule(list(row["antecedents"]), list(row["consequents"]), float(row["confidence"])),
        })
    
    result.sort(key=lambda x: x["lift"], reverse=True)
    return result[:10]

def _interpret_rule(antecedents: list, consequents: list, confidence: float) -> str:
    ant_str = " & ".join(a.replace("FAIL:", "Failed ").replace("CRITICAL:", "Critical ").replace("PATHOGEN:", "Pathogen: ").replace("_", " ").title() for a in antecedents)
    con_str = " & ".join(c.replace("FAIL:", "Failed ").replace("CRITICAL:", "Critical ").replace("PATHOGEN:", "Pathogen: ").replace("EVENT:", "Event: ").replace("_", " ").title() for c in consequents)
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
    anomaly_count = sum(1 for r in recent_lab if r.get("anomaly", {}).get("is_anomaly", False))

    return {
        "total_wards": len(wards), "risk_distribution": risk_distribution,
        "average_compliance": round(avg_compliance, 1), "pending_alerts": len(pending_alerts),
        "recent_anomalies": anomaly_count, "hospital_risk_level": _risk_level_from_score(100.0 - avg_compliance),
    }