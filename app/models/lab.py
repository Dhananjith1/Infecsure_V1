"""
InfecSure — Pydantic Models: Laboratory Results
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel


class SpecimenType(str, Enum):
    BLOOD = "blood"
    URINE = "urine"
    SPUTUM = "sputum"
    WOUND_SWAB = "wound_swab"
    CSF = "csf"
    STOOL = "stool"
    OTHER = "other"


class AnomalyFlag(BaseModel):
    is_anomaly: bool
    z_score: float
    message: Optional[str] = None
    severity: Optional[str] = None  # "warning" | "critical"


class LabResultCreate(BaseModel):
    ward_id: str
    pathogen_id: str
    pathogen_name: str                  # Denormalized for fast reads
    specimen_type: SpecimenType
    result_date: datetime
    test_result: Optional[str] = None
    colony_count: Optional[int] = None
    resistance_profile: Optional[list[str]] = []  # e.g. ["MRSA", "VRE"]
    antibiotic_sensitivity: Optional[dict] = {}   # {"ampicillin": "R", "ciprofloxacin": "S"}
    patient_ward_location: Optional[str] = None   # ward/bed reference (masked for staff)
    notes: Optional[str] = None


class LabResult(LabResultCreate):
    result_id: str
    entered_by_uid: str
    entered_by_name: str
    status: str = "pending"
    anomaly: Optional[AnomalyFlag] = None
    created_at: Optional[datetime] = None


class LabResultPublic(BaseModel):
    """Masked version for Staff/Doctor role — no patient identifiers."""
    result_id: str
    ward_id: str
    pathogen_name: str
    specimen_type: SpecimenType
    result_date: datetime
    test_result: Optional[str] = None
    status: str = "pending"
    anomaly: Optional[AnomalyFlag] = None
    created_at: Optional[datetime] = None


class LabSlipOCRRequest(BaseModel):
    image_base64: str


class LabSlipOCRResponse(BaseModel):
    raw_text: str
    extracted_fields: dict[str, Any]
    tokens: list[dict[str, Any]] = []
    low_confidence_count: int = 0
    engine: str = "easyocr"
