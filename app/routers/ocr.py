"""
InfecSure — OCR Router
=======================
POST /ocr/scan    → upload image → OCR pipeline → confidence queue
GET  /ocr/queue   → list pending OCR records (ICNO only)
POST /ocr/confirm → ICNO confirms/edits extracted fields
GET  /ocr/{scan_id} → get OCR record
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.dependencies import require_role
from app.models.auth import TokenData
from app.models.ocr import OCRConfirmRequest, OCRResult, OCRScanRequest
from app.models.user import UserRole
from app.services import firebase_service as fs, ocr_service

router = APIRouter(prefix="/ocr", tags=["OCR Pipeline"])

_ICNO_ONLY = Depends(require_role(UserRole.ICNO))


@router.post("/scan", status_code=status.HTTP_201_CREATED, summary="Scan and process a document (ICNO only)")
async def scan_document(body: OCRScanRequest, current_user: TokenData = _ICNO_ONLY):
    """
    Submit a Base64-encoded image for OCR processing.
    The pipeline:
    1. Decodes the image
    2. Preprocesses with OpenCV (denoise, deskew, threshold)
    3. Extracts text with EasyOCR
    4. Flags low-confidence tokens for ICNO review
    5. Returns extracted fields + confidence scores

    The result is stored in the `ocr_queue` with status 'pending_review'.
    """
    try:
        ocr_output = ocr_service.process_image(body.image_base64, body.form_type.value)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    data = {
        "form_type": body.form_type.value,
        "reference_id": body.reference_id,
        "raw_text": ocr_output["raw_text"],
        "tokens": ocr_output["tokens"],
        "low_confidence_count": ocr_output["low_confidence_count"],
        "extracted_fields": ocr_output["extracted_fields"],
        "created_by_uid": current_user.uid,
    }

    scan_id = fs.create_ocr_record(data)

    return {
        "scan_id": scan_id,
        "form_type": body.form_type.value,
        "raw_text": ocr_output["raw_text"],
        "tokens": ocr_output["tokens"],
        "low_confidence_count": ocr_output["low_confidence_count"],
        "extracted_fields": ocr_output["extracted_fields"],
        "status": "pending_review",
        "message": (
            f"OCR complete. {ocr_output['low_confidence_count']} token(s) flagged for review."
        ),
    }


@router.get("/queue", summary="List pending OCR records (ICNO only)")
async def list_ocr_queue(_: TokenData = _ICNO_ONLY):
    """Returns all OCR records pending ICNO review and confirmation."""
    return fs.list_ocr_queue(status="pending_review")


@router.get("/{scan_id}", summary="Get OCR record (ICNO only)")
async def get_ocr_record(scan_id: str, _: TokenData = _ICNO_ONLY):
    record = fs.get_ocr_record(scan_id)
    if not record:
        raise HTTPException(status_code=404, detail="OCR record not found.")
    return record


@router.post("/confirm", summary="ICNO confirms and commits an OCR record")
async def confirm_ocr(body: OCRConfirmRequest, current_user: TokenData = _ICNO_ONLY):
    """
    ICNO reviews the extracted fields, makes corrections if needed,
    and commits the record to the historical database.

    If `commit_to_collection` is specified (e.g. 'lab_results', 'audits'),
    the corrected fields are stored in that Firestore collection.
    """
    record = fs.get_ocr_record(body.scan_id)
    if not record:
        raise HTTPException(status_code=404, detail="OCR record not found.")
    if record.get("status") == "committed":
        raise HTTPException(status_code=400, detail="OCR record already committed.")

    # Update with ICNO-corrected fields
    fs.confirm_ocr_record(body.scan_id, body.corrected_fields)

    # Optionally commit to a target collection
    if body.commit_to_collection:
        from datetime import datetime, timezone
        commit_data = {
            **body.corrected_fields,
            "source": "ocr",
            "ocr_scan_id": body.scan_id,
            "committed_by_uid": current_user.uid,
            "created_at": datetime.now(timezone.utc),
        }
        fs.create_document(body.commit_to_collection, commit_data)
        fs.commit_ocr_record(body.scan_id)

        return {
            "scan_id": body.scan_id,
            "status": "committed",
            "collection": body.commit_to_collection,
            "message": f"Record committed to '{body.commit_to_collection}' collection.",
        }

    return {
        "scan_id": body.scan_id,
        "status": "confirmed",
        "message": "OCR record confirmed. Fields saved for review.",
    }
