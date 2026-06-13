"""
InfecSure — Pydantic Models: Pathogens
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel


class PathogenRiskLevel(str, Enum):
    LOW = "low"
    MODERATE = "moderate"
    HIGH = "high"
    CRITICAL = "critical"


class PathogenCreate(BaseModel):
    name: str
    category: str  # e.g. "bacteria", "virus", "fungus"
    risk_level: PathogenRiskLevel
    description: Optional[str] = None
    typical_source: Optional[str] = None


class Pathogen(PathogenCreate):
    pathogen_id: str
    created_at: Optional[datetime] = None
