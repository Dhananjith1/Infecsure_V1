"""
InfecSure — Pydantic Models: Alerts
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel


class AlertType(str, Enum):
    ANOMALY = "anomaly"
    OUTBREAK_RISK = "outbreak_risk"
    COMPLIANCE_FAILURE = "compliance_failure"
    MISSED_AUDIT = "missed_audit"
    MOH_NOTIFICATION = "moh_notification"


class AlertStatus(str, Enum):
    PENDING = "pending"       # AI generated, awaiting ICNO review
    APPROVED = "approved"     # ICNO validated — visible to target roles
    REJECTED = "rejected"     # ICNO dismissed
    DISPATCHED = "dispatched" # Email sent to MoH


class AlertCreate(BaseModel):
    alert_type: AlertType
    ward_id: Optional[str] = None
    title: str
    description: str
    severity: str  # "low" | "medium" | "high" | "critical"
    source_data: Optional[dict[str, Any]] = None  # Raw ML output that triggered alert
    target_roles: list[str] = []  # Which roles can see this after approval


class Alert(AlertCreate):
    alert_id: str
    status: AlertStatus = AlertStatus.PENDING
    created_at: Optional[datetime] = None
    validated_at: Optional[datetime] = None
    validated_by_uid: Optional[str] = None
    icno_notes: Optional[str] = None


class ValidateAlertRequest(BaseModel):
    icno_notes: Optional[str] = None


class RejectAlertRequest(BaseModel):
    icno_notes: Optional[str] = None
