"""
InfecSure — Pydantic Models: OCR
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel


class FormType(str, Enum):
    MOH_NOTIFICATION = "moh_notification"
    HAND_HYGIENE_AUDIT = "hand_hygiene_audit"
    WARD_INSPECTION = "ward_inspection"
    GENERAL = "general"


class ConfidenceToken(BaseModel):
    text: str
    confidence: float
    bbox: Optional[list[int]] = None   # [x1, y1, x2, y2]
    needs_review: bool = False         # True when confidence < threshold


class OCRScanRequest(BaseModel):
    image_base64: str                  # Base64-encoded image data
    form_type: FormType = FormType.GENERAL
    reference_id: Optional[str] = None  # Optional link to existing record


class OCRResult(BaseModel):
    scan_id: str
    form_type: FormType
    raw_text: str
    tokens: list[ConfidenceToken]
    low_confidence_count: int
    extracted_fields: dict[str, Any]   # Parsed key-value pairs from the form
    image_url: Optional[str] = None    # Firebase Storage URL
    status: str = "pending_review"     # "pending_review" | "confirmed" | "committed"
    created_at: Optional[datetime] = None


class OCRConfirmRequest(BaseModel):
    scan_id: str
    corrected_fields: dict[str, Any]   # ICNO-edited final values
    commit_to_collection: Optional[str] = None  # e.g. "lab_results", "audits"
