"""
InfecSure — Pydantic Models: Pathogens
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field, model_validator


class PathogenRiskLevel(str, Enum):
    LOW = "low"
    MODERATE = "moderate"
    HIGH = "high"
    CRITICAL = "critical"


class PathogenCreate(BaseModel):
    name: str
    category: str  # e.g. "bacteria", "virus", "fungus"
    risk_level: PathogenRiskLevel
    clinical_risk_class: Optional[int] = Field(default=None, ge=1, le=3)
    description: Optional[str] = None
    typical_source: Optional[str] = None

    @model_validator(mode="after")
    def assign_clinical_risk_class(self):
        if self.clinical_risk_class is None:
            self.clinical_risk_class = {
                PathogenRiskLevel.LOW: 1,
                PathogenRiskLevel.MODERATE: 2,
                PathogenRiskLevel.HIGH: 3,
                PathogenRiskLevel.CRITICAL: 3,
            }[self.risk_level]
        return self


class Pathogen(PathogenCreate):
    pathogen_id: str
    created_at: Optional[datetime] = None
