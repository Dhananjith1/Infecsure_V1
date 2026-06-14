"""
InfecSure — Pydantic Models: Wards
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, field_validator, model_validator


class WardType(str, Enum):
    MALE = "male_ward"
    FEMALE = "female_ward"


ALLOWED_WARDS: dict[str, WardType] = {
    "Male Ward": WardType.MALE,
    "Female Ward": WardType.FEMALE,
}


def normalize_ward_name(name: str) -> str:
    normalized = " ".join(name.strip().split()).lower()
    if normalized in {"male ward", "male"}:
        return "Male Ward"
    if normalized in {"female ward", "femal ward", "female", "femal"}:
        return "Female Ward"
    raise ValueError("This hospital has only two wards: Male Ward and Female Ward.")


def ward_type_for_name(name: str) -> WardType:
    return ALLOWED_WARDS[normalize_ward_name(name)]


class RiskLevel(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class WardCreate(BaseModel):
    name: str
    ward_type: Optional[WardType] = None
    bed_count: int
    floor: Optional[str] = None
    description: Optional[str] = None

    @field_validator("name")
    @classmethod
    def validate_ward_name(cls, value: str) -> str:
        return normalize_ward_name(value)

    @model_validator(mode="after")
    def align_ward_type(self):
        expected_type = ward_type_for_name(self.name)
        if self.ward_type is not None and self.ward_type != expected_type:
            raise ValueError(f"{self.name} must use ward_type '{expected_type.value}'.")
        self.ward_type = expected_type
        return self


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
