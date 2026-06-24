"""
InfecSure — Pydantic Models: Ward Audits
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class ComplianceItem(BaseModel):
    """Single compliance check result."""
    item_name: str
    compliant: bool
    notes: Optional[str] = None


class AuditMetricCounts(BaseModel):
    """Raw numerator/denominator counts captured by the PWA."""

    correct: int = Field(..., ge=0)
    total: int = Field(..., ge=0)


class WasteSegregationCounts(BaseModel):
    """Waste audit counts where fewer misplaced items means better compliance."""

    misplaced_items: int = Field(..., ge=0)
    total_items: int = Field(..., ge=0)


class AuditSyncItem(BaseModel):
    ward_id: str
    hand_hygiene: AuditMetricCounts
    ppe_adherence: AuditMetricCounts
    waste_segregation: WasteSegregationCounts
    environmental_score: float = Field(..., ge=0.0, le=100.0)
    hand_hygiene_items: list[ComplianceItem] = []
    ppe_items: list[ComplianceItem] = []
    waste_segregation_items: list[ComplianceItem] = []
    environmental_items: list[ComplianceItem] = []
    remarks: Optional[str] = None
    offline_record_id: Optional[str] = None
    captured_at: Optional[datetime] = None


class AuditSyncRequest(BaseModel):
    records: list[AuditSyncItem]


class AuditCreate(BaseModel):
    ward_id: str
    # Hand Hygiene section
    hand_hygiene_score: float = Field(..., ge=0.0, le=100.0,
                                      description="Hand hygiene compliance %")
    hand_hygiene_items: list[ComplianceItem] = []

    # PPE section
    ppe_score: float = Field(..., ge=0.0, le=100.0,
                             description="PPE compliance %")
    ppe_items: list[ComplianceItem] = []

    # Waste Segregation section
    waste_segregation_score: float = Field(..., ge=0.0, le=100.0,
                                           description="Waste segregation %")
    waste_segregation_items: list[ComplianceItem] = []

    # Environmental Hygiene
    environmental_score: float = Field(..., ge=0.0, le=100.0)
    environmental_items: list[ComplianceItem] = []

    remarks: Optional[str] = None
    is_offline_sync: bool = False


class WardAudit(AuditCreate):
    audit_id: str
    conducted_by_uid: str
    conducted_by_name: str
    overall_compliance_score: float
    created_at: Optional[datetime] = None


class AuditSummary(BaseModel):
    audit_id: str
    ward_id: str
    ward_name: str
    overall_compliance_score: float
    conducted_by_name: str
    created_at: Optional[datetime] = None
