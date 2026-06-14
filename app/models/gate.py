"""
InfecSure - ICNO Validation Gate models.
"""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel


class GateValidationRequest(BaseModel):
    alert_id: str
    decision: Literal["approve", "reject"]
    icno_notes: Optional[str] = None
