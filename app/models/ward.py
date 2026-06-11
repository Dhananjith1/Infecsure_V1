"""
InfecSure — Pydantic Models: Wards
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel


class WardType(str, Enum):
    GENERAL = "general"
    ICU = "icu"
    MATERNITY = "maternity"
    PEDIATRIC = "pediatric"
    SURGICAL = "surgical"
    EMERGENCY = "emergency"
    OUTPATIENT = "outpatient"
    LABORATORY = "laboratory"


class RiskLevel(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class WardCreate(BaseModel):
    name: str
    ward_type: WardType
    bed_count: int
    floor: Optional[str] = None
    description: Optional[str] = None


class Ward(WardCreate):
    ward_id: str
    risk_level: RiskLevel = RiskLevel.LOW
    risk_score: float = 0.0
    compliance_score: float = 100.0
    last_audit_at: Optional[datetime] = None
    created_at: Optional[datetime] = None


class WardRiskScore(BaseModel):
    ward_id: str
    ward_name: str
    risk_score: float
    risk_level: RiskLevel
    compliance_score: float
    anomaly_count: int
    last_updated: Optional[datetime] = None
