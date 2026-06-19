"""
InfecSure - Lab Results Router
"""

from __future__ import annotations

import base64
import re
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from starlette.concurrency import run_in_threadpool

from app.dependencies import get_current_user, require_role
from app.models.auth import TokenData
from app.models.lab import LabResultCreate, LabSlipOCRRequest, LabSlipOCRResponse
from app.models.user import UserRole
from app.services import domain_service, fallback_data, firebase_service as fs, ocr_service

router = APIRouter(prefix="/lab-results", tags=["Laboratory Results"])

_ALL_AUTH = Depends(get_current_user)
_LAB_OR_ICNO = Depends(require_role(UserRole.LAB, UserRole.ICNO))


def _is_lab_user(current_user: TokenData) -> bool:
    return current_user.role == UserRole.LAB.value


def _only_own_lab_results(results: list[dict], current_user: TokenData) -> list[dict]:
    if not _is_lab_user(current_user):
        return results
    return [r for r in results if r.get("entered_by_uid") == current_user.uid]


def _mask_staff_result(result: dict) -> dict:
    return {
        "result_id": result.get("result_id") or result.get("_id"),
        "ward_id": result.get("ward_id"),
        "pathogen_name": result.get("pathogen_name"),
        "specimen_type": result.get("specimen_type"),
        "test_result": result.get("test_result"),
        "status": result.get("status", "pending"),
        "result_date": result.get("result_date"),
        "anomaly": result.get("anomaly"),
        "created_at": result.get("created_at"),
    }


def _clean_base64_image(image_base64: str) -> bytes:
    if "," in image_base64:
        image_base64 = image_base64.split(",", 1)[1]
    return base64.b64decode(image_base64)


def _google_vision_text(image_base64: str) -> str | None:
    try:
        from google.cloud import vision  # type: ignore  # noqa: PLC0415
    except Exception:
        return None
    try:
        image = vision.Image(content=_clean_base64_image(image_base64))
        response = vision.ImageAnnotatorClient().text_detection(image=image)
        if response.error.message:
            return None
        texts = response.text_annotations or []
        return texts[0].description if texts else ""
    except Exception:
        return None


def _match_lab_slip_fields(raw_text: str) -> dict[str, Any]:
    text_lower = raw_text.lower()
    fields: dict[str, Any] = {}

    bht_match = re.search(r"(?i)\b(?:bht|bed\s*head\s*ticket|patient\s*id|ref(?:erence)?)\s*[:#-]?\s*([A-Za-z0-9/-]{2,30})", raw_text)
    if bht_match:
        fields["patient_ward_location"] = bht_match.group(1).strip()

    ward_id = None
    ward_match = re.search(r"(?i)\b(?:ward|unit)\s*[:#-]?\s*([A-Za-z0-9 _/-]{2,45})", raw_text)
    ward_text = ward_match.group(1).strip() if ward_match else ""
    normalized_ward = ward_text.lower()
    if "female" in normalized_ward:
        ward_id = "female_ward"
    elif "male" in normalized_ward:
        ward_id = "male_ward"
    elif "etu" in normalized_ward or "emergency" in normalized_ward:
        ward_id = "etu"
    elif "opd" in normalized_ward or "out patient" in normalized_ward:
        ward_id = "opd"
    elif "family" in normalized_ward or "clinic" in normalized_ward:
        ward_id = "family_medical_clinic"
    elif "psychiat" in normalized_ward or "psych" in normalized_ward:
        ward_id = "psychiatrist_clinic"
    if ward_id:
        fields["ward_id"] = ward_id

    if "dengue" in text_lower or "ns1" in text_lower:
        fields.update({
            "pathogen_id": "dengue",
            "pathogen_name": "Dengue NS1",
            "specimen_type": "blood",
        })
    elif "covid" in text_lower or "cov-19" in text_lower or "sars" in text_lower or "rdt" in text_lower:
        fields.update({
            "pathogen_id": "covid19",
            "pathogen_name": "Covid-19 RDT",
            "specimen_type": "other",
        })

    result_match = re.search(r"(?i)\b(?:result|interpretation)\s*[:#-]?\s*(positive|negative|detected|not\s+detected|reactive|non[-\s]?reactive)", raw_text)
    result_word = result_match.group(1).lower() if result_match else ""
    if result_word:
        is_negative = "negative" in result_word or "not" in result_word or "non" in result_word
        fields["test_result"] = "negative" if is_negative else "positive"
        fields["colony_count"] = 0 if is_negative else 1

    return fields


def _easyocr_lab_slip(image_base64: str) -> dict[str, Any]:
    result = ocr_service.process_image(image_base64, form_type="moh_notification")
    result["engine"] = "easyocr"
    result["extracted_fields"] = {
        **result.get("extracted_fields", {}),
        **_match_lab_slip_fields(result.get("raw_text", "")),
    }
    return result


def _scan_lab_slip(image_base64: str) -> dict[str, Any]:
    raw_text = _google_vision_text(image_base64)
    if raw_text is not None:
        return {
            "raw_text": raw_text,
            "tokens": [],
            "low_confidence_count": 0,
            "extracted_fields": _match_lab_slip_fields(raw_text),
            "engine": "google_vision",
        }
    return _easyocr_lab_slip(image_base64)


@router.post("/", status_code=status.HTTP_201_CREATED, summary="Enter lab result (Lab / ICNO)")
async def create_lab_result(
    body: LabResultCreate,
    current_user: TokenData = _LAB_OR_ICNO,
):
    """
    Record a microbiology result, run Z-Score anomaly detection, update ward
    risk, and create alerts when needed.
    """
    try:
        return domain_service.create_lab_result(
            body,
            entered_by_uid=current_user.uid,
            entered_by_email=current_user.email,
        )
    except ValueError as exc:
        message = str(exc)
        status_code = 404 if "not found" in message.lower() else 400
        raise HTTPException(status_code=status_code, detail=message)


@router.post("/scan-slip", response_model=LabSlipOCRResponse, summary="OCR lab slip auto-fill (Lab / ICNO)")
async def scan_lab_slip(
    body: LabSlipOCRRequest,
    _: TokenData = _LAB_OR_ICNO,
):
    """
    Extract typed lab-slip fields for rapid auto-fill. Google Vision is used when
    its client and credentials are available; the local OCR pipeline is the
    fallback for offline development.
    """
    try:
        return await run_in_threadpool(_scan_lab_slip, body.image_base64)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/", summary="List all lab results")
async def list_lab_results(
    ward_id: str = None,
    current_user: TokenData = _ALL_AUTH,
):
    """
    Returns lab results.
    Lab role sees only records entered by the same authenticated lab user.
    Staff role receives masked data with no patient identifiers.
    """
    try:
        results = fs.list_lab_results(ward_id=ward_id)
    except Exception as exc:
        if fallback_data.is_quota_error(exc):
            results = [r for r in fallback_data.LAB_RESULTS if not ward_id or r.get("ward_id") == ward_id]
        else:
            raise
    results = _only_own_lab_results(results, current_user)
    if current_user.role == UserRole.STAFF.value:
        return [_mask_staff_result(r) for r in results]
    return results


@router.get("/{result_id}", summary="Get specific lab result")
async def get_lab_result(result_id: str, current_user: TokenData = _ALL_AUTH):
    result = fs.get_lab_result(result_id)
    if not result:
        raise HTTPException(status_code=404, detail="Lab result not found.")
    if _is_lab_user(current_user) and result.get("entered_by_uid") != current_user.uid:
        raise HTTPException(status_code=403, detail="Lab users can only access their own submissions.")
    if current_user.role == UserRole.STAFF.value:
        result.pop("patient_ward_location", None)
        result.pop("entered_by_uid", None)
        result.pop("resistance_profile", None)
        result.pop("antibiotic_sensitivity", None)
    return result
