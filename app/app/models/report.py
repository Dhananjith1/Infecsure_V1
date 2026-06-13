"""
InfecSure — Pydantic Models: Reports
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel


class ReportFormat(str, Enum):
    PDF = "pdf"
    EXCEL = "excel"


class ReportType(str, Enum):
    EXECUTIVE_SUMMARY = "executive_summary"
    DENGUE_ALERT = "dengue_alert"
    WARD_COMPLIANCE = "ward_compliance"
    OUTBREAK_RISK = "outbreak_risk"
    LAB_MONTHLY = "lab_monthly"


class ReportRequest(BaseModel):
    report_type: ReportType
    format: ReportFormat = ReportFormat.PDF
    date_from: Optional[datetime] = None
    date_to: Optional[datetime] = None
    ward_ids: Optional[list[str]] = None
    extra_params: Optional[dict[str, Any]] = None


class ReportResponse(BaseModel):
    report_id: str
    report_type: ReportType
    format: ReportFormat
    download_url: str
    file_size_bytes: Optional[int] = None
    generated_at: datetime
    generated_by_uid: str
