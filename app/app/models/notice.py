"""
InfecSure — Pydantic Models: Notices
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class NoticeCreate(BaseModel):
    title: str
    body: str
    is_pinned: bool = False
    expires_at: Optional[datetime] = None


class Notice(NoticeCreate):
    notice_id: str
    posted_by_uid: str
    posted_by_name: str
    created_at: Optional[datetime] = None
